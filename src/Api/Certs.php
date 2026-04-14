<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

class Certs extends BaseApi
{
    public function all(): array
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
