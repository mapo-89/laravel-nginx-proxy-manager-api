<?php

use Illuminate\Support\Facades\Http;

function fakeNpmApi(array $responses = []): void
{
    Http::fake(array_merge([
        '*tokens' => Http::response([
            'token' => 'test-token',
        ], 200),

        '*' => Http::response([], 200),
    ], $responses));
}
