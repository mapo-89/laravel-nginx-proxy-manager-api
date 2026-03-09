<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;

class Certs
{
    protected ApiClient $client;

    public function __construct(ApiClient $client)
    {
        $this->client = $client;
    }

    public function getAll(): array
    {
        return $this->client->get('/nginx/certificates');
    }

    public function create(array $data = []): array
    {
        return $this->client->post('/nginx/certificates');
    }

    public function renew(string $certiId): array
    {
        return $this->client->post("/nginx/certificates/{$certiId}/renew");
    }
}
