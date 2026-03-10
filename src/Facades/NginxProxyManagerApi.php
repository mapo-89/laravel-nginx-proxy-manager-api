<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @see \Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi
 */
class NginxProxyManagerApi extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return \Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi::class;
    }
}
