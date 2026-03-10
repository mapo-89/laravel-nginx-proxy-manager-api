<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;
use Mapo89\LaravelNginxProxyManagerApi\Constants\ProxyType;
use Mapo89\LaravelNginxProxyManagerApi\Models\ProxyHost;

class Hosts
{
    protected ApiClient $client;

    protected string $proxyType;

    protected array $modelMap = [
        ProxyType::PROXY       => ProxyHost::class,
        //ProxyType::REDIRECTION => RedirectionHost::class,
        //ProxyType::DEAD      => DeadHost::class,
    ];

    public function __construct(ApiClient $client, string $proxyType = ProxyType::PROXY)
    {
        $this->client = $client;
        $this->proxyType = $proxyType;
    }

    public function all(): array
    {
        return $this->client->get("nginx/{$this->proxyType}-hosts");
    }

    public function create(array|string $firstArg, array $data = []): array
    {
        if (is_string($firstArg)) {
            $this->proxyType = $firstArg;
        } elseif (is_array($firstArg)) {
            $data = $firstArg;
        } else {
            throw new \InvalidArgumentException('First argument must be string (proxyType) or array (data)');
        }

        if (!isset($this->modelMap[$this->proxyType])) {
            throw new \InvalidArgumentException("Unknown proxy type: {$this->proxyType}");
        }

        $modelClass = $this->modelMap[$this->proxyType];
        $host = new $modelClass($data);

        return $this->client->post("nginx/{$this->proxyType}-hosts", $host->toArray());
    }
}
