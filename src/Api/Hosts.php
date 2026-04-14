<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;
use Mapo89\LaravelNginxProxyManagerApi\Constants\ProxyType;
use Mapo89\LaravelNginxProxyManagerApi\Models\ProxyHost;

class Hosts extends BaseApi
{
    protected string $proxyType;

    protected array $modelMap = [
        ProxyType::PROXY => ProxyHost::class,
        // ProxyType::REDIRECTION => RedirectionHost::class,
        // ProxyType::DEAD      => DeadHost::class,
    ];

    public function __construct(ApiClient $client, string $proxyType = ProxyType::PROXY)
    {
        parent::__construct($client);

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

        if (! isset($this->modelMap[$this->proxyType])) {
            throw new \InvalidArgumentException("Unknown proxy type: {$this->proxyType}");
        }

        $this->validateHostData($data);

        $modelClass = $this->modelMap[$this->proxyType];
        $host = new $modelClass($data);

        return $this->client->post("nginx/{$this->proxyType}-hosts", $host->toArray());
    }

    protected function validateHostData(array $data): void
    {
        $validator = Validator::make($data, [
            'domain_names' => 'required|array|min:1',
            'domain_names.*' => 'required|string',
            'forward_scheme' => 'sometimes|string|in:http,https',
            'forward_host' => 'sometimes|string',
            'forward_port' => 'sometimes|integer|min:1',
            'certificate_id' => 'sometimes|integer|min:1',
            'ssl_forced' => 'sometimes|boolean',
            'hsts_enabled' => 'sometimes|boolean',
            'hsts_subdomains' => 'sometimes|boolean',
            'http2_support' => 'sometimes|boolean',
            'block_exploits' => 'sometimes|boolean',
            'caching_enabled' => 'sometimes|boolean',
            'allow_websocket_upgrade' => 'sometimes|boolean',
            'access_list_id' => 'sometimes|integer|min:0',
            'advanced_config' => 'sometimes|string',
            'enabled' => 'sometimes|boolean',
            'meta' => 'sometimes|array',
            'locations' => 'sometimes|array',
        ]);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }
    }
}
