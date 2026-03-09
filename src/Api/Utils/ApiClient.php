<?php
/*
 * ApiClient.php
 * @author Manuel Postler <info@postler.de>
 * @copyright 2026 Manuel Postler
 */

namespace Mapo89\LaravelNginxProxyManagerApi\Api\Utils;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\UnauthorizedException;

class ApiClient
{
    protected ?array $configLoader;
    protected ?string $token = null;

    public function __construct(?array $configLoader = null)
    {
        $this->configLoader = $configLoader;
    }

    private function normalizeBaseUrl(string $url): string
    {
        $url = rtrim($url, '/');
        if (!Str::endsWith($url, '/api')) {
            $url .= '/api';
        }
        return $url . '/';
    }

    public function getConfig(): array
    {
        $config = $this->configLoader ?? [
            'url' => config('nginx-proxy-manager-api.base_url'),
            'email' => config('nginx-proxy-manager-api.email'),
            'password' => config('nginx-proxy-manager-api.password'),
        ];

        if (!isset($config['url'], $config['email'], $config['password'])) {
            throw new \InvalidArgumentException("Config must include 'url', 'email' and 'password'");
        }

        return $config;
    }

    public function getToken(): string
    {
        if ($this->token) {
            return $this->token;
        }

        $config = $this->getConfig();
        $baseUrl = $this->normalizeBaseUrl($config['url']);
        $cacheKey = 'npm-api-token-' . md5($config['url'] . $config['email']);

        $this->token = Cache::remember(
            $cacheKey,
            now()->addMinutes(30),
            function () use ($baseUrl, $config) {

                $response = Http::post($baseUrl.'tokens', [
                    'identity' => $config['email'],
                    'secret' => $config['password'],
                ]);

                if ($response->failed()) {
                    throw new \RuntimeException('Could not authenticate with NPM API');
                }

                return $response->json('token');
            }
        );

        return $this->token;
    }

    public function execute(string $httpMethod, string $endpoint = '', array $parameters = [], bool $asArray = true): mixed
    {
        $allowedMethods = ['get','post','put','patch','delete'];
        $httpMethod = strtolower($httpMethod);
        if (!in_array($httpMethod, $allowedMethods)) {
            throw new \InvalidArgumentException("Invalid HTTP method: {$httpMethod}");
        }

        $config = $this->getConfig();
        $baseUrl = $this->normalizeBaseUrl($config['url']);
        $apiToken = $this->getToken();

        $request = Http::withToken($apiToken);

        $response = match ($httpMethod) {
            'get' => $request->get("{$baseUrl}{$endpoint}", $parameters),
            default => $request->$httpMethod("{$baseUrl}{$endpoint}", $parameters),
        };

        if ($response->status() === 401) {
            throw new UnauthorizedException("Unauthorized: Check your token");
        }

        return $asArray ? $response->json() : $response->body();
    }

    // ========================= base methods ======================================
    public function get(?string $url = null, array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('get', $url ?? '', $parameters, $asArray);
    }

    public function post(?string $url = null, array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('post', $url ?? '', $parameters, $asArray);
    }

    public function put(?string $url = null, array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('put', $url ?? '', $parameters, $asArray);
    }

    public function patch(?string $url = null, array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('patch', $url ?? '', $parameters, $asArray);
    }

    public function delete(?string $url = null, array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('delete', $url ?? '', $parameters, $asArray);
    }
}
