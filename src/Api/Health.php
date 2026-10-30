<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

class Health extends BaseApi
{
    /**
     * @return array<string, mixed>
     */
    public function check(): array
    {
        return $this->client->get('/');
    }
}
