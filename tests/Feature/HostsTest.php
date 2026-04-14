<?php

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
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

    Http::assertSent(fn ($request) =>
        str_contains($request->url(), 'nginx/proxy-hosts')
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
})->throws(\Illuminate\Validation\ValidationException::class);
