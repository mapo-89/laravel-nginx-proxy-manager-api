<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

class Health extends BaseApi
{
    public function check(): array
    {
        return $this->client->get('/');
    }
}
