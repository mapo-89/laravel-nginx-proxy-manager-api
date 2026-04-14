<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Models;

class HostLocation extends ApiModel
{
    protected $fillable = [
        'forward_scheme',
        'forward_host',
        'forward_port',
        'path',
        'id',
        'forward_path',
        'advanced_config',
    ];

    protected $casts = [
        'forward_port' => 'integer',
    ];

    protected function getDefaultAttributes(): array
    {
        return [
            'forward_scheme' => 'http',
            'forward_host' => '127.0.0.1',
            'forward_port' => 80,
            'path' => '/',
            'id' => null,
            'forward_path' => '',
            'advanced_config' => '',
        ];
    }
}
