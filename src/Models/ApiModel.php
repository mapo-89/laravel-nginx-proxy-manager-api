<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Models;

use Illuminate\Database\Eloquent\Model;

abstract class ApiModel extends Model
{
    public $timestamps = false;

    protected $table = null;

    public function __construct(array $attributes = [])
    {
        $attributes = array_merge($this->getDefaultAttributes(), $attributes);

        parent::__construct($attributes);
    }

    protected function getDefaultAttributes(): array
    {
        return [];
    }
}
