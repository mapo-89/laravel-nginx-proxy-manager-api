<?php

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;

beforeEach(function () {
    Http::preventStrayRequests();
    $this->api = NginxProxyManagerApi::make([
        'url' => 'https://npm.example.test',
        'token' => 'test-session',
    ]);
});

it('lists certificates and preserves the upstream response', function () {
    $certificates = [['id' => 7, 'provider' => 'other', 'nice_name' => 'Test certificate']];
    Http::fake(['https://npm.example.test/api/nginx/certificates' => Http::response($certificates)]);

    expect($this->api->certs()->all())->toBe($certificates);
    Http::assertSentCount(1);
    Http::assertSent(fn ($request) => $request->method() === 'GET'
        && $request->hasHeader('Authorization', 'Bearer test-session'));
});

it('creates a certificate with the supplied provider and metadata', function () {
    $payload = [
        'provider' => 'letsencrypt',
        'domain_names' => ['example.test'],
        'meta' => ['dns_challenge' => true, 'dns_provider' => 'cloudflare'],
    ];
    $certificate = ['id' => 7, ...$payload];
    Http::fake(['https://npm.example.test/api/nginx/certificates' => Http::response($certificate, 201)]);

    expect($this->api->certs()->create($payload))->toBe($certificate);
    Http::assertSentCount(1);
    Http::assertSent(fn ($request) => $request->method() === 'POST'
        && json_decode($request->body(), true) === $payload);
});

it('renews exactly the requested certificate without sending login credentials', function () {
    $certificate = ['id' => 7, 'provider' => 'letsencrypt', 'expires_on' => '2027-01-01T00:00:00Z'];
    Http::fake(['https://npm.example.test/api/nginx/certificates/7/renew' => Http::response($certificate)]);

    expect($this->api->certs()->renew('7'))->toBe($certificate);
    Http::assertSentCount(1);
    Http::assertSent(fn ($request) => $request->method() === 'POST'
        && $request->data() === []
        && $request->hasHeader('Authorization', 'Bearer test-session'));
});

it('surfaces certificate API failures without exposing response data or retrying writes', function (string $operation, int $status) {
    Http::fake(['*' => Http::response(['error' => ['message' => 'private-provider-credential']], $status)]);

    try {
        match ($operation) {
            'all' => $this->api->certs()->all(),
            'create' => $this->api->certs()->create(['provider' => 'other', 'nice_name' => 'Test certificate']),
            'renew' => $this->api->certs()->renew('7'),
        };
        $this->fail('Expected the certificate request to fail.');
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toContain((string) $status)
            ->not->toContain('private-provider-credential');
    }

    Http::assertSentCount(1);
})->with(['all', 'create', 'renew'])->with([401, 403, 422, 500]);

it('preserves transport exceptions for certificate requests', function () {
    Http::fake(['*' => Http::failedConnection()]);

    expect(fn () => $this->api->certs()->all())->toThrow(ConnectionException::class);
});
