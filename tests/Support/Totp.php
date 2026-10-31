<?php

namespace Mapo89\LaravelNginxProxyManagerApi\Tests\Support;

final class Totp
{
    public static function code(string $secret, ?int $timestamp = null): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $buffer = 0;
        $bits = 0;
        $key = '';

        foreach (str_split(rtrim(strtoupper($secret), '=')) as $character) {
            $value = strpos($alphabet, $character);
            if ($value === false) {
                throw new \InvalidArgumentException('Invalid Base32 TOTP secret.');
            }

            $buffer = ($buffer << 5) | $value;
            $bits += 5;
            if ($bits >= 8) {
                $bits -= 8;
                $key .= chr(($buffer >> $bits) & 255);
                $buffer &= (1 << $bits) - 1;
            }
        }

        $counter = intdiv($timestamp ?? time(), 30);
        $message = pack('N2', intdiv($counter, 4294967296), $counter % 4294967296);
        $hash = hash_hmac('sha1', $message, $key, true);
        $offset = ord($hash[19]) & 15;
        $value = unpack('N', substr($hash, $offset, 4))[1] & 2147483647;

        return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
    }
}
