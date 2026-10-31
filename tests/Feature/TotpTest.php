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

it('waits for a fresh TOTP window before an HTTP exchange near expiry', function () {
    $timestamp = 1111111109;
    $waits = [];

    $code = Totp::freshCode(
        'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
        function () use (&$timestamp): int {
            return $timestamp;
        },
        function (int $seconds) use (&$timestamp, &$waits): void {
            $waits[] = $seconds;
            $timestamp += $seconds;
        },
    );

    expect($waits)->toBe([1])
        ->and($code)->toBe('050471');
});

it('uses a sufficiently fresh TOTP window without waiting', function () {
    $code = Totp::freshCode(
        'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
        static fn (): int => 1111111111,
        function (int $seconds): void {
            throw new RuntimeException('A fresh TOTP window must not wait.');
        },
    );

    expect($code)->toBe('050471');
});
