<?php

// config for Mapo89/LaravelNginxProxyManagerApi
return [
    'base_url' => env('NPM_URL'),
    'email' => env('NPM_EMAIL'),
    'password' => env('NPM_PASSWORD'),
    'token_cache_ttl' => env('NPM_TOKEN_CACHE_TTL', 30),
    'cache_responses' => env('NPM_CACHE_RESPONSES', false),
    'response_cache_ttl' => env('NPM_RESPONSE_CACHE_TTL', 300),
];
