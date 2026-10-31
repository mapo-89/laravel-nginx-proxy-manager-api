<?php

use Mapo89\LaravelNginxProxyManagerApi\Tests\Support\Totp;

it('generates six-digit SHA-1 TOTP codes using the RFC 6238 reference vectors', function (int $timestamp, string $expected) {
    expect(Totp::code('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', $timestamp))->toBe($expected);
})->with([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
]);
