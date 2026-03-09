<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;

class Health
{
    protected ApiClient $client;

    public function __construct(ApiClient $client)
    {
        $this->client = $client;
    }

    public function check(): array
    {
        return $this->client->get('/');
    }
}
