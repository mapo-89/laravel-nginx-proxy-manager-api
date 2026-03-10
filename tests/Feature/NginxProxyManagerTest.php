<?php

use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;

it('loads the health api resource', function () {

    $api = new NginxProxyManagerApi;

    expect($api->health())
        ->toBeInstanceOf(\Mapo89\LaravelNginxProxyManagerApi\Api\Health::class);

});

it('throws exception for unknown api resource', function () {

    $api = new NginxProxyManagerApi;

    $api->doesNotExist();

})->throws(\BadMethodCallException::class);
