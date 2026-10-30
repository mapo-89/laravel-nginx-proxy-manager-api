<?php

/*
 * ApiClient.php
 * @author Manuel Postler <info@postler.de>
 * @copyright 2026 Manuel Postler
 */

namespace Mapo89\LaravelNginxProxyManagerApi\Api\Utils;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\UnauthorizedException;

class ApiClient
{
    /** @var array<string, mixed>|null */
    protected ?array $config;

    /**
     * @param  array<string, mixed>|null  $config
     */
    public function __construct(?array $config = null)
    {
        $this->config = $config;
    }

    /**
     * @return array<string, mixed>
     */
    protected function getConfig(): array
    {
        $config = array_replace([
            'url' => config('nginx-proxy-manager-api.base_url'),
            'email' => config('nginx-proxy-manager-api.email'),
            'password' => config('nginx-proxy-manager-api.password'),
            'token_cache_ttl' => config('nginx-proxy-manager-api.token_cache_ttl', 30),
            'cache_responses' => config('nginx-proxy-manager-api.cache_responses', false),
            'response_cache_ttl' => config('nginx-proxy-manager-api.response_cache_ttl', 300),
            'timeout' => config('nginx-proxy-manager-api.timeout', 15),
            'connect_timeout' => config('nginx-proxy-manager-api.connect_timeout', 3),
        ], $this->config ?? []);

        if (! isset($config['url']) || (empty($config['token']) && ! isset($config['email'], $config['password']))) {
            throw new \InvalidArgumentException("Config must include 'url', 'email', and 'password'");
        }

        return $config;
    }

    protected function normalizeBaseUrl(string $url): string
    {
        $url = rtrim($url, '/');

        return Str::endsWith($url, '/api') ? $url.'/' : $url.'/api/';
    }

    /**
     * Get API token from cache or login
     */
    public function getToken(): string
    {
        $config = $this->getConfig();
        if (is_string($config['token'] ?? null) && $config['token'] !== '') {
            return $config['token'];
        }
        $cacheKey = $this->getTokenCacheKey($config);

        return Cache::remember($cacheKey, $config['token_cache_ttl'] * 60, function () {
            return $this->authenticate()['token'];
        });
    }

    /**
     * @param  array<string, mixed>  $config
     */
    protected function getTokenCacheKey(array $config): string
    {
        return 'npm-api-token-'.hash('sha256', json_encode([
            $this->normalizeBaseUrl($config['url']),
            $config['email'],
            $config['password'],
        ], JSON_THROW_ON_ERROR));
    }

    /** @return array{token: string, expires: mixed, two_factor: bool} */
    public function authenticate(?string $code = null): array
    {
        $config = $this->getConfig();
        try {
            $response = Http::acceptJson()->withoutRedirecting()->connectTimeout($config['connect_timeout'])->timeout($config['timeout'])
                ->post($this->normalizeBaseUrl($config['url']).'tokens', ['identity' => $config['email'], 'secret' => $config['password']]);
            $twoFactor = $response->successful() && $response->json('requires_2fa') === true;
            if ($twoFactor) {
                if ($code === null || $code === '') {
                    throw new TwoFactorRequiredException('Nginx Proxy Manager requires two-factor authentication.');
                }
                $challenge = $response->json('challenge_token');
                if (! is_string($challenge) || $challenge === '') {
                    throw new \RuntimeException('Invalid authentication challenge.');
                }
                $response = Http::acceptJson()->withoutRedirecting()->connectTimeout($config['connect_timeout'])->timeout($config['timeout'])
                    ->post($this->normalizeBaseUrl($config['url']).'tokens/2fa', ['challenge_token' => $challenge, 'code' => $code]);
            }
            if (! $response->successful() || ! is_string($response->json('token')) || $response->json('token') === '') {
                throw new \RuntimeException('Invalid authentication response.');
            }

            return ['token' => $response->json('token'), 'expires' => $response->json('expires'), 'two_factor' => $twoFactor];
        } catch (TwoFactorRequiredException $exception) {
            throw $exception;
        } catch (\Throwable) {
            throw new \RuntimeException('Nginx Proxy Manager authentication failed.');
        }
    }

    /** @return array{token: string, expires: mixed} */
    public function refreshToken(string $token): array
    {
        $config = $this->getConfig();
        try {
            $response = Http::withToken($token)->acceptJson()->withoutRedirecting()->connectTimeout($config['connect_timeout'])->timeout($config['timeout'])
                ->get($this->normalizeBaseUrl($config['url']).'tokens');
            if (! $response->successful() || ! is_string($response->json('token')) || $response->json('token') === '') {
                throw new \RuntimeException('Invalid token refresh response.');
            }

            return ['token' => $response->json('token'), 'expires' => $response->json('expires')];
        } catch (\Throwable) {
            throw new \RuntimeException('Nginx Proxy Manager session could not be renewed.');
        }
    }

    /**
     * Execute request
     *
     * @param  array<string, mixed>  $parameters
     */
    public function execute(string $method, string $endpoint = '', array $parameters = [], bool $asArray = true): mixed
    {
        $allowedMethods = ['get', 'post', 'put', 'patch', 'delete'];
        $method = strtolower($method);

        if (! in_array($method, $allowedMethods)) {
            throw new \InvalidArgumentException("Invalid HTTP method: {$method}");
        }

        $config = $this->getConfig();
        $baseUrl = $this->normalizeBaseUrl($config['url']);

        if ($this->shouldCacheResponse($method, $asArray, $config)) {
            $cacheKey = $this->getResponseCacheKey($method, $endpoint, $parameters, $asArray, $config);

            if (Cache::has($cacheKey)) {
                return Cache::get($cacheKey);
            }

            $response = $this->performRequest($method, $baseUrl, $endpoint, $parameters);
            $result = $asArray ? $response->json() : $response->body();

            if ($response->successful()) {
                Cache::put($cacheKey, $result, $config['response_cache_ttl'] * 60);
            }

            return $result;
        }

        $response = $this->performRequest($method, $baseUrl, $endpoint, $parameters);

        return $asArray ? $response->json() : $response->body();
    }

    /**
     * @param  array<string, mixed>  $parameters
     */
    protected function performRequest(string $method, string $baseUrl, string $endpoint, array $parameters): Response
    {
        $config = $this->getConfig();
        $apiToken = $this->getToken();

        $response = Http::withToken($apiToken)->acceptJson()->withoutRedirecting()->connectTimeout($config['connect_timeout'])->timeout($config['timeout'])->$method($baseUrl.ltrim($endpoint, '/'), $parameters);

        if ($response->status() === 401 && empty($config['token'])) {
            Cache::forget($this->getTokenCacheKey($config));
            $response = Http::withToken($this->getToken())->acceptJson()->withoutRedirecting()->connectTimeout($config['connect_timeout'])->timeout($config['timeout'])->$method($baseUrl.ltrim($endpoint, '/'), $parameters);
            if ($response->status() === 401) {
                throw new UnauthorizedException('Unauthorized: Check your token');
            }
        }

        if (! $response->successful()) {
            throw new \RuntimeException('Nginx Proxy Manager request failed (HTTP '.$response->status().').');
        }

        return $response;
    }

    /**
     * @param  array<string, mixed>  $config
     */
    protected function shouldCacheResponse(string $method, bool $asArray, array $config): bool
    {
        return $method === 'get' && $config['cache_responses'];
    }

    /**
     * @param  array<string, mixed>  $parameters
     * @param  array<string, mixed>  $config
     */
    protected function getResponseCacheKey(string $method, string $endpoint, array $parameters, bool $asArray, array $config): string
    {
        return 'npm-api-response-'.md5($config['url'].($config['email'] ?? '').hash('sha256', ($config['token'] ?? '').($config['password'] ?? '')).$method.$endpoint.json_encode($parameters).($asArray ? '1' : '0'));
    }

    // ========================= base methods ======================================
    /**
     * @param  array<string, mixed>  $parameters
     */
    public function get(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('get', $url, $parameters, $asArray);
    }

    /**
     * @param  array<string, mixed>  $parameters
     */
    public function post(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('post', $url, $parameters, $asArray);
    }

    /**
     * @param  array<string, mixed>  $parameters
     */
    public function put(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('put', $url, $parameters, $asArray);
    }

    /**
     * @param  array<string, mixed>  $parameters
     */
    public function patch(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('patch', $url, $parameters, $asArray);
    }

    /**
     * @param  array<string, mixed>  $parameters
     */
    public function delete(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('delete', $url, $parameters, $asArray);
    }
}
