<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Api;

class Certs extends BaseApi
{
    /**
     * @return array<array-key, mixed>
     */
    public function all(): array
    {
        return $this->client->get('/nginx/certificates');
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<array-key, mixed>
     */
    public function create(array $data = []): array
    {
        return $this->client->post('/nginx/certificates', $data);
    }

    /**
     * @return array<array-key, mixed>
     */
    public function renew(string $certiId): array
    {
        return $this->client->post("/nginx/certificates/{$certiId}/renew");
    }
}
