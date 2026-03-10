<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Models;

use Illuminate\Database\Eloquent\Model;

class HostLocation extends Model
{
    public $timestamps = false;
    protected $table = null;

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

    public function __construct(array $attributes = [])
    {
        $attributes = array_merge([
            'forward_scheme' => 'http',
            'forward_host' => '127.0.0.1',
            'forward_port' => 80,
            'path' => '/',
            'id' => null,
            'forward_path' => '',
            'advanced_config' => '',
        ], $attributes);

        parent::__construct($attributes);
    }
}
