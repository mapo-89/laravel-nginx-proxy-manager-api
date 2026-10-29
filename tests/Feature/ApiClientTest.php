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

    Http::assertSent(fn ($request) => str_contains($request->url(), '/api/')
    );
});

it('throws exception for invalid http method', function () {

    $client = new ApiClient;
    $client->execute('invalid');

})->throws(InvalidArgumentException::class);

it('retrieves api token', function () {

    fakeNpmApi();

    $client = new ApiClient;
    expect($client->getToken())->toBe('test-token');
});

it('caches the token', function () {
    fakeNpmApi();
    $client = new ApiClient;
    $client->getToken();
    $client->getToken();
    Http::assertSentCount(1);
});

it('caches GET responses when enabled', function () {
    Config::set('nginx-proxy-manager-api.cache_responses', true);
    Config::set('nginx-proxy-manager-api.response_cache_ttl', 60);

    fakeNpmApi([
        '*' => Http::response(['data' => 'ok'], 200),
    ]);

    $client = new ApiClient;
    $first = $client->get('nginx/test');
    $second = $client->get('nginx/test');

    expect($first)->toEqual(['data' => 'ok']);
    expect($second)->toEqual(['data' => 'ok']);
    Http::assertSentCount(2);
});

it('rejects unsuccessful API responses without exposing their bodies', function () {
    Http::fake(['*tokens' => Http::response(['token' => 'token']), '*' => Http::response(['secret' => 'private-response'], 500)]);
    try {
        (new ApiClient)->get('nginx/proxy-hosts');
        $this->fail('Expected a failed API request.');
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->not->toContain('private-response')->toContain('500');
    }
});

it('refreshes an expired token once', function () {
    Http::fake(['*tokens' => Http::sequence()->push(['token' => 'old'])->push(['token' => 'new']), '*proxy-hosts' => Http::sequence()->push([], 401)->push([])]);
    (new ApiClient)->get('nginx/proxy-hosts');
    Http::assertSentCount(4);
    Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer new'));
});

it('normalizes resource endpoints and passes explicit timeouts', function () {
    Http::fake(function ($request, $options) {
        expect($options['timeout'])->toBe(12)->and($options['connect_timeout'])->toBe(2)->and($options['allow_redirects'])->toBeFalse();

        return Http::response(str_ends_with($request->url(), '/tokens') ? ['token' => 'token'] : []);
    });
    (new ApiClient(['url' => 'http://localhost/api/', 'email' => 'test@example.com', 'password' => 'secret', 'timeout' => 12, 'connect_timeout' => 2]))->get('/nginx/proxy-hosts');
    Http::assertSent(fn ($request) => $request->url() === 'http://localhost/api/nginx/proxy-hosts');
});

it('supports finding updating and deleting hosts', function () {
    Http::fake(['*tokens' => Http::response(['token' => 'token']), '*' => Http::response([])]);
    $hosts = NginxProxyManagerApi::make()->hosts('proxy');
    $hosts->find(7);
    $hosts->update(7, ['domain_names' => ['example.test']]);
    $hosts->delete(7);
    foreach (['GET', 'PUT', 'DELETE'] as $method) {
        Http::assertSent(fn ($request) => $request->method() === $method && $request->url() === 'http://localhost/api/nginx/proxy-hosts/7');
    }
});
