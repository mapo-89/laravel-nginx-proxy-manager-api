<?php

use Illuminate\Support\ServiceProvider;
use Mapo89\LaravelNginxProxyManagerApi\Api\Health;
use Mapo89\LaravelNginxProxyManagerApi\Facades\NginxProxyManagerApi as ApiFacade;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApiServiceProvider;

it('registers the documented configuration and publish tag', function () {
    expect(config('nginx-proxy-manager-api'))->toHaveKeys([
        'base_url', 'email', 'password', 'timeout', 'connect_timeout',
        'token_cache_ttl', 'cache_responses', 'response_cache_ttl',
    ]);

    $paths = ServiceProvider::pathsToPublish(NginxProxyManagerApiServiceProvider::class, 'nginx-proxy-manager-api-config');

    expect(array_map('realpath', array_keys($paths)))->toContain(realpath(dirname(__DIR__, 2).'/config/nginx-proxy-manager-api.php'));
});

it('resolves the documented Laravel facade and health resource without network access', function () {
    expect(ApiFacade::getFacadeRoot())->toBeInstanceOf(NginxProxyManagerApi::class)
        ->and(ApiFacade::health())->toBeInstanceOf(Health::class);
});
