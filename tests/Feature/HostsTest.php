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
