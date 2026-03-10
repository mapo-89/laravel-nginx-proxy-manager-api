<?php

namespace Mapo89\LaravelNginxProxyManagerApi;

use Illuminate\Support\Str;
use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;

class NginxProxyManagerApi
{
    protected ApiClient $client;

    public function __construct(?ApiClient $client = null)
    {
        $this->client = $client ?? new ApiClient;
    }

    public static function make(?array $config = null): self
    {
        return new self(
            new ApiClient($config)
        );
    }

    public function __call(string $method, array $parameters): object
    {
        return $this->getApiInstance($method, $parameters);
    }

    protected function getApiInstance(string $method, array $parameters = []): object
    {
        $class = __NAMESPACE__.'\\Api\\'.Str::studly($method);

        if (! class_exists($class)) {
            throw new \BadMethodCallException(
                sprintf(
                    'API endpoint [%s] does not exist. Expected class %s.',
                    $method,
                    $class
                )
            );
        }

        return new $class($this->client, ...$parameters);
    }
}
