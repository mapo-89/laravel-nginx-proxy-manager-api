<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Models;

use Illuminate\Database\Eloquent\Model;

class ProxyHost extends Model
{
    public $timestamps = false;

    protected $table = null;

    protected $fillable = [
        'domain_names',
        'forward_scheme',
        'forward_host',
        'forward_port',
        'certificate_id',
        'ssl_forced',
        'hsts_enabled',
        'hsts_subdomains',
        'http2_support',
        'block_exploits',
        'caching_enabled',
        'allow_websocket_upgrade',
        'access_list_id',
        'advanced_config',
        'enabled',
        'meta',
        'locations',
    ];

    protected $casts = [
        'domain_names' => 'array',
        'forward_port' => 'integer',
        'certificate_id' => 'integer',
        'ssl_forced' => 'boolean',
        'hsts_enabled' => 'boolean',
        'hsts_subdomains' => 'boolean',
        'http2_support' => 'boolean',
        'block_exploits' => 'boolean',
        'caching_enabled' => 'boolean',
        'allow_websocket_upgrade' => 'boolean',
        'access_list_id' => 'integer',
        'enabled' => 'boolean',
        'meta' => 'array',
        'locations' => 'array',
    ];

    public function __construct(array $attributes = [])
    {
        $attributes = array_merge([
            'domain_names' => [],
            'forward_scheme' => 'http',
            'forward_host' => '127.0.0.1',
            'forward_port' => 80,
            'certificate_id' => null,
            'ssl_forced' => false,
            'hsts_enabled' => false,
            'hsts_subdomains' => false,
            'http2_support' => true,
            'block_exploits' => true,
            'caching_enabled' => false,
            'allow_websocket_upgrade' => true,
            'access_list_id' => null,
            'advanced_config' => '',
            'enabled' => true,
            'meta' => [],
            'locations' => [],
        ], $attributes);

        parent::__construct($attributes);
    }
}
