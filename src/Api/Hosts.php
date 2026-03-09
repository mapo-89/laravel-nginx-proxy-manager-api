<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;

class Hosts
{
    protected ApiClient $client;

    public function __construct(ApiClient $client)
    {
        $this->client = $client;
    }

    public function get(string $proxyType): array
    {
        return $this->client->get("/nginx/{$proxyType}-hosts");
    }

    public function post(string $proxyType, array $data = []): array
    {
        return $this->client->get("/nginx/{$proxyType}-hosts");
    }
}
