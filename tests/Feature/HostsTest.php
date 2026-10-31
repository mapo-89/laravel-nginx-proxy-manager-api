<?php

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;

beforeEach(function () {
    Config::set('nginx-proxy-manager-api.base_url', 'http://localhost');
    Config::set('nginx-proxy-manager-api.email', 'test@example.com');
    Config::set('nginx-proxy-manager-api.password', 'secret');
});

it('calls proxy hosts endpoint', function () {

    fakeNpmApi();

    $api = new NginxProxyManagerApi;

    $api->hosts()->all();

    Http::assertSent(fn ($request) => str_contains($request->url(), 'nginx/proxy-hosts')
    );
});

it('supports different proxy types', function () {

    fakeNpmApi();

    $api = new NginxProxyManagerApi;

    $api->hosts('redirection')->all();

    Http::assertSent(fn ($request) => str_contains($request->url(), 'nginx/redirection-hosts')
    );
});

it('creates a proxy host with valid data', function () {
    fakeNpmApi();

    $api = new NginxProxyManagerApi;

    $api->hosts()->create([
        'domain_names' => ['example.com'],
        'forward_scheme' => 'http',
        'forward_host' => '127.0.0.1',
        'forward_port' => 8080,
    ]);

    Http::assertSent(fn ($request) => str_contains($request->url(), 'nginx/proxy-hosts')
        && $request['forward_port'] === 8080
        && $request['domain_names'] === ['example.com']
    );
});

it('throws validation exception for missing required host data', function () {
    fakeNpmApi();

    $api = new NginxProxyManagerApi;

    $api->hosts()->create([
        'forward_scheme' => 'http',
    ]);
})->throws(ValidationException::class);

it('serializes default host IDs and metadata with API-compatible JSON types', function () {
    fakeNpmApi();

    NginxProxyManagerApi::make()->hosts()->create([
        'domain_names' => ['example.com'],
    ]);

    Http::assertSent(function ($request) {
        if (! str_ends_with($request->url(), '/nginx/proxy-hosts')) {
            return false;
        }

        $payload = json_decode($request->body());

        return $payload->certificate_id === 0
            && $payload->access_list_id === 0
            && $payload->meta instanceof stdClass
            && $payload->locations === [];
    });
});

it('allows removing a certificate with a partial update', function () {
    fakeNpmApi();

    NginxProxyManagerApi::make()->hosts()->update(7, ['certificate_id' => 0]);

    Http::assertSent(fn ($request) => $request->method() === 'PUT'
        && str_ends_with($request->url(), '/nginx/proxy-hosts/7')
        && $request->data() === ['certificate_id' => 0]);
});

it('updates a host without resending unchanged domains or defaults', function () {
    fakeNpmApi();

    NginxProxyManagerApi::make()->hosts()->update(7, ['forward_port' => 8081]);

    Http::assertSent(fn ($request) => $request->method() === 'PUT'
        && $request->data() === ['forward_port' => 8081]);
});

it('serializes cleared metadata as an object on updates', function () {
    fakeNpmApi();

    NginxProxyManagerApi::make()->hosts()->update(7, ['meta' => []]);

    Http::assertSent(fn ($request) => $request->method() === 'PUT'
        && json_decode($request->body())->meta instanceof stdClass);
});

it('preserves custom metadata when creating a host', function () {
    fakeNpmApi();

    NginxProxyManagerApi::make()->hosts()->create([
        'domain_names' => ['example.com'],
        'meta' => ['letsencrypt_agree' => true],
    ]);

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/nginx/proxy-hosts')
        && json_decode($request->body())->meta->letsencrypt_agree === true);
});

it('rejects invalid partial updates before making requests', function (array $data) {
    Http::preventStrayRequests();

    expect(fn () => NginxProxyManagerApi::make()->hosts()->update(7, $data))
        ->toThrow(ValidationException::class);

    Http::assertNothingSent();
})->with([
    'empty update' => [[]],
    'empty domains' => [['domain_names' => []]],
    'null domains' => [['domain_names' => null]],
    'negative certificate' => [['certificate_id' => -1]],
]);

it('rejects ports outside the TCP range before creating or updating hosts', function (int $port) {
    Http::preventStrayRequests();

    $hosts = NginxProxyManagerApi::make()->hosts();

    expect(fn () => $hosts->create(['domain_names' => ['example.com'], 'forward_port' => $port]))
        ->toThrow(ValidationException::class);
    expect(fn () => $hosts->update(7, ['forward_port' => $port]))
        ->toThrow(ValidationException::class);

    Http::assertNothingSent();
})->with([0, -1, 65536]);

it('accepts ports at both ends of the TCP range', function (int $port) {
    fakeNpmApi();

    $hosts = NginxProxyManagerApi::make()->hosts();
    $hosts->create(['domain_names' => ['example.com'], 'forward_port' => $port]);
    $hosts->update(7, ['forward_port' => $port]);

    foreach (['POST', 'PUT'] as $method) {
        Http::assertSent(fn ($request) => $request->method() === $method
            && str_contains($request->url(), '/nginx/proxy-hosts')
            && $request['forward_port'] === $port);
    }
})->with([1, 65535]);

it('serializes the forwarded protocol setting as a boolean on creation and updates', function (bool|int|string $value, bool $trust) {
    fakeNpmApi();

    $hosts = NginxProxyManagerApi::make()->hosts();
    $hosts->create(['domain_names' => ['example.com'], 'trust_forwarded_proto' => $value]);
    $hosts->update(7, ['trust_forwarded_proto' => $value]);

    foreach (['POST', 'PUT'] as $method) {
        Http::assertSent(fn ($request) => $request->method() === $method
            && str_contains($request->url(), '/nginx/proxy-hosts')
            && property_exists(json_decode($request->body()), 'trust_forwarded_proto')
            && json_decode($request->body())->trust_forwarded_proto === $trust);
    }
})->with([
    'true' => [true, true],
    'false' => [false, false],
    'integer true' => [1, true],
    'integer false' => [0, false],
    'string true' => ['1', true],
    'string false' => ['0', false],
]);

it('does not send the optional forwarded protocol setting unless supplied', function () {
    fakeNpmApi();

    NginxProxyManagerApi::make()->hosts()->create(['domain_names' => ['example.com']]);

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/nginx/proxy-hosts')
        && ! property_exists(json_decode($request->body()), 'trust_forwarded_proto'));
});

it('rejects invalid forwarded protocol settings before sending requests', function () {
    Http::preventStrayRequests();

    $hosts = NginxProxyManagerApi::make()->hosts();

    expect(fn () => $hosts->create(['domain_names' => ['example.com'], 'trust_forwarded_proto' => 'invalid']))
        ->toThrow(ValidationException::class);
    expect(fn () => $hosts->update(7, ['trust_forwarded_proto' => 'invalid']))
        ->toThrow(ValidationException::class);

    Http::assertNothingSent();
});

it('preserves valid custom locations on creation and partial updates', function (int $port) {
    fakeNpmApi();

    $locations = [[
        'id' => null,
        'path' => '/app',
        'forward_scheme' => 'https',
        'forward_host' => 'backend.example.com',
        'forward_port' => $port,
        'access_list_id' => 0,
        'forward_path' => '',
        'advanced_config' => '',
    ]];
    $hosts = NginxProxyManagerApi::make()->hosts();
    $hosts->create(['domain_names' => ['example.com'], 'locations' => $locations]);
    $hosts->update(7, ['locations' => $locations]);

    foreach (['POST', 'PUT'] as $method) {
        Http::assertSent(fn ($request) => $request->method() === $method
            && str_contains($request->url(), '/nginx/proxy-hosts')
            && $request['locations'] === $locations);
    }
})->with([1, 65535]);

it('allows clearing custom locations with an empty list', function () {
    fakeNpmApi();

    NginxProxyManagerApi::make()->hosts()->update(7, ['locations' => []]);

    Http::assertSent(fn ($request) => $request->method() === 'PUT'
        && $request->data() === ['locations' => []]);
});

it('rejects invalid custom locations before creating or updating hosts', function (array $override) {
    Http::preventStrayRequests();

    $locations = $override['locations'] ?? [array_replace([
        'path' => '/app',
        'forward_scheme' => 'http',
        'forward_host' => 'backend.example.com',
        'forward_port' => 8080,
    ], $override)];
    $hosts = NginxProxyManagerApi::make()->hosts();

    expect(fn () => $hosts->create(['domain_names' => ['example.com'], 'locations' => $locations]))
        ->toThrow(ValidationException::class);
    expect(fn () => $hosts->update(7, ['locations' => $locations]))
        ->toThrow(ValidationException::class);

    Http::assertNothingSent();
})->with([
    'missing fields' => [['locations' => [[]]]],
    'non-object location' => [['locations' => ['invalid']]],
    'non-list locations' => [['locations' => ['app' => []]]],
    'empty path' => [['path' => '']],
    'empty backend' => [['forward_host' => '']],
    'overlong backend' => [['forward_host' => str_repeat('a', 256)]],
    'unsupported scheme' => [['forward_scheme' => 'ftp']],
    'zero port' => [['forward_port' => 0]],
    'negative port' => [['forward_port' => -1]],
    'overflowing port' => [['forward_port' => 65536]],
    'negative access list' => [['access_list_id' => -1]],
    'invalid ID' => [['id' => 'invalid']],
    'invalid forward path' => [['forward_path' => []]],
    'invalid advanced configuration' => [['advanced_config' => []]],
    'unknown field' => [['unsupported' => true]],
]);
