<?php

use Illuminate\Support\Facades\Config;
use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;
use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\TwoFactorRequiredException;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;
use Mapo89\LaravelNginxProxyManagerApi\Tests\Support\Totp;

it('exercises authentication, hosts, certificates and two-factor sessions against real NPM', function () {
    $url = getenv('NPM_TEST_URL');
    $email = getenv('NPM_TEST_EMAIL');
    $password = getenv('NPM_TEST_PASSWORD');

    if (! $url || ! $email || ! $password) {
        throw new RuntimeException('Set NPM_TEST_URL, NPM_TEST_EMAIL and NPM_TEST_PASSWORD for a dedicated NPM test instance.');
    }

    Config::set('cache.default', 'array');
    $credentials = ['url' => $url, 'email' => $email, 'password' => $password, 'cache_responses' => false, 'timeout' => 30];
    $login = new ApiClient($credentials);
    $token = $login->getToken();
    $admin = new ApiClient(['url' => $url, 'token' => $token, 'timeout' => 30]);
    $api = NginxProxyManagerApi::make(['url' => $url, 'token' => $token, 'cache_responses' => false, 'timeout' => 30]);
    $prefix = 'laravel-npm-'.bin2hex(random_bytes(8));
    $hostId = null;
    $certificateId = null;
    $userId = null;
    $failure = null;
    $cleanupFailures = [];

    try {
        $health = $api->health()->check();
        // NPM's health version comes from backend/package.json, not its image tag.
        // CI controls the tested build with the pinned Docker image instead.
        expect($health['status'])->toBe('OK')
            ->and($health['version']['major'])->toBe(2);

        $renewed = $login->refreshToken($token);
        expect(is_string($renewed['token']) && $renewed['token'] !== '')->toBeTrue();
        $admin = new ApiClient(['url' => $url, 'token' => $renewed['token'], 'timeout' => 30]);
        $api = NginxProxyManagerApi::make(['url' => $url, 'token' => $renewed['token'], 'cache_responses' => false, 'timeout' => 30]);

        $host = $api->hosts()->create([
            'domain_names' => [$prefix.'.example.test'],
            'forward_scheme' => 'http',
            'forward_host' => '127.0.0.1',
            'forward_port' => 8080,
            'trust_forwarded_proto' => true,
            'locations' => [[
                'path' => '/app',
                'forward_scheme' => 'http',
                'forward_host' => '127.0.0.1',
                'forward_port' => 8081,
            ]],
        ]);
        $hostId = $host['id'];
        // Creation returns the pre-configuration row; re-read persisted nginx status.
        $storedHost = $api->hosts()->find($hostId);
        $this->assertTrue(
            $storedHost['meta']['nginx_online'] ?? false,
            'NPM could not activate the test proxy host: '.($storedHost['meta']['nginx_err'] ?? 'no details'),
        );
        expect($host['trust_forwarded_proto'])->toBeTrue()
            ->and($host['locations'][0]['path'])->toBe('/app')
            ->and(array_column($api->hosts()->all(), 'id'))->toContain($hostId)
            ->and($storedHost['domain_names'])->toBe([$prefix.'.example.test']);

        $updated = $api->hosts()->update($hostId, ['forward_port' => 8082, 'trust_forwarded_proto' => false]);
        expect($updated['forward_port'])->toBe(8082)
            ->and($updated['trust_forwarded_proto'])->toBeFalse()
            ->and($api->hosts()->update($hostId, ['locations' => []])['locations'])->toBe([]);
        $api->hosts()->delete($hostId);
        expect(array_column($api->hosts()->all(), 'id'))->not->toContain($hostId);
        $hostId = null;

        // Custom certificates exercise NPM's real storage without an external ACME issuer.
        $certificate = $api->certs()->create(['provider' => 'other', 'nice_name' => $prefix]);
        $certificateId = $certificate['id'];
        expect($certificate['provider'])->toBe('other')
            ->and(array_column($api->certs()->all(), 'id'))->toContain($certificateId);
        expect(fn () => $api->certs()->renew((string) $certificateId))->toThrow(RuntimeException::class);

        // Enable 2FA on a newly created account, never on the supplied administrator.
        $testEmail = $prefix.'@example.test';
        $testPassword = bin2hex(random_bytes(20));
        $user = $admin->post('users', [
            'name' => 'Laravel API integration',
            'nickname' => $prefix,
            'email' => $testEmail,
            'roles' => ['admin'],
            'auth' => ['type' => 'password', 'secret' => $testPassword],
        ]);
        $userId = $user['id'];
        $userLogin = new ApiClient(['url' => $url, 'email' => $testEmail, 'password' => $testPassword]);
        $setup = $admin->post("users/{$userId}/2fa");
        $admin->post("users/{$userId}/2fa/enable", ['code' => Totp::freshCode($setup['secret'])]);

        expect(fn () => $userLogin->getToken())->toThrow(TwoFactorRequiredException::class);
        $session = $userLogin->authenticate(Totp::freshCode($setup['secret']));
        expect($session['two_factor'])->toBeTrue();
        $sessionApi = NginxProxyManagerApi::make(['url' => $url, 'token' => $session['token'], 'cache_responses' => false]);
        expect($sessionApi->hosts()->all())->toBeArray();

        $renewal = (new ApiClient(['url' => $url]))->refreshToken($session['token']);
        $renewedApi = NginxProxyManagerApi::make(['url' => $url, 'token' => $renewal['token'], 'cache_responses' => false]);
        expect($renewedApi->hosts()->all())->toBeArray();
    } catch (Throwable $exception) {
        $failure = $exception;
    } finally {
        // Attempt every cleanup even if a previous cleanup or an assertion fails.
        foreach ([
            'host' => $hostId === null ? null : "nginx/proxy-hosts/{$hostId}",
            'certificate' => $certificateId === null ? null : "nginx/certificates/{$certificateId}",
            'user' => $userId === null ? null : "users/{$userId}",
        ] as $resource => $endpoint) {
            if ($endpoint !== null) {
                try {
                    $admin->delete($endpoint);
                } catch (Throwable) {
                    $cleanupFailures[] = $resource;
                }
            }
        }
    }

    if ($cleanupFailures !== []) {
        throw new RuntimeException('NPM integration cleanup failed for: '.implode(', ', $cleanupFailures), previous: $failure);
    }
    if ($failure !== null) {
        throw $failure;
    }
})->group('integration');
