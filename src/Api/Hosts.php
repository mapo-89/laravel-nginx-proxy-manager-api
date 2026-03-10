<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;
use Mapo89\LaravelNginxProxyManagerApi\Constants\ProxyType;

class Hosts
{
    protected ApiClient $client;

    protected string $proxyType;

    public function __construct(ApiClient $client, string $proxyType = ProxyType::PROXY)
    {
        $this->client = $client;
        $this->proxyType = $proxyType;
    }

    public function all(): array
    {
        return $this->client->get("/nginx/{$this->proxyType}-hosts");
    }

    public function create(array $data = []): array
    {
        return $this->client->post("/nginx/{$this->proxyType}-hosts", $data);
    }
}
