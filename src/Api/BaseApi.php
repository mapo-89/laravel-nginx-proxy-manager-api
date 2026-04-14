<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;

abstract class BaseApi
{
    protected ApiClient $client;

    public function __construct(ApiClient $client)
    {
        $this->client = $client;
    }
}
