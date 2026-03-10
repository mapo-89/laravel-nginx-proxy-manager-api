<?php

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;

beforeEach(function () {
    Config::set('nginx-proxy-manager-api.base_url', 'http://localhost');
    Config::set('nginx-proxy-manager-api.email', 'test@example.com');
    Config::set('nginx-proxy-manager-api.password', 'secret');
});

it('adds api to base url automatically', function () {

    fakeNpmApi();

    $api = NginxProxyManagerApi::make();
    $api->health()->check();

    Http::assertSent(fn ($request) =>
        str_contains($request->url(), '/api/')
    );
});

it('throws exception for invalid http method', function () {

    $client = new ApiClient();
    $client->execute('invalid');

})->throws(\InvalidArgumentException::class);

it('retrieves api token', function () {

    fakeNpmApi();

    $client = new ApiClient();
    expect($client->getToken())->toBe('test-token');
});

it('caches the token', function () {
    fakeNpmApi();
    $client = new ApiClient();
    $client->getToken();
    $client->getToken();
    Http::assertSentCount(1);
});
