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
    protected ?array $config;

    public function __construct(?array $config = null)
    {
        $this->config = $config;
    }

    protected function getConfig(): array
    {
        $config = $this->config ?? [
            'url' => config('nginx-proxy-manager-api.base_url'),
            'email' => config('nginx-proxy-manager-api.email'),
            'password' => config('nginx-proxy-manager-api.password'),
            'token_cache_ttl' => config('nginx-proxy-manager-api.token_cache_ttl', 30),
        ];

        if (! isset($config['url'], $config['email'], $config['password'])) {
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
        $cacheKey = 'npm-api-token-'.md5($config['url'].$config['email']);

        return Cache::remember($cacheKey, $config['token_cache_ttl'] * 60, function () use ($config) {
            $response = Http::post($this->normalizeBaseUrl($config['url']).'tokens', [
                'identity' => $config['email'],
                'secret' => $config['password'],
            ])->throw();

            return $response->json('token');
        });
    }

    /**
     * Execute request
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
        $apiToken = $this->getToken();

        $response = Http::withToken($apiToken)->$method($baseUrl.$endpoint, $parameters);

        if ($response->status() === 401) {
            throw new UnauthorizedException('Unauthorized: Check your token');
        }

        return $asArray ? $response->json() : $response->body();
    }

    // ========================= base methods ======================================
    public function get(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('get', $url, $parameters, $asArray);
    }

    public function post(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('post', $url, $parameters, $asArray);
    }

    public function put(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('put', $url, $parameters, $asArray);
    }

    public function patch(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('patch', $url, $parameters, $asArray);
    }

    public function delete(string $url = '', array $parameters = [], bool $asArray = true): mixed
    {
        return $this->execute('delete', $url, $parameters, $asArray);
    }
}
