<?php

// config for Mapo89/LaravelNginxProxyManagerApi
return [
    'base_url' => env('NPM_URL'),
    'email' => env('NPM_EMAIL'),
    'password' => env('NPM_PASSWORD'),
    'token_cache_ttl' => env('NPM_TOKEN_CACHE_TTL', 30),
];
