# Laravel Nginx Proxy Manager API

[![Version](https://img.shields.io/packagist/v/mapo-89/laravel-nginx-proxy-manager-api.svg?label=version&color=03a9f4)](https://packagist.org/packages/mapo-89/laravel-nginx-proxy-manager-api)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/mapo-89/laravel-nginx-proxy-manager-api/blob/main/LICENSE.md)
[![PHP](https://img.shields.io/packagist/php-v/mapo-89/laravel-nginx-proxy-manager-api.svg?logo=php&logoColor=white)](https://packagist.org/packages/mapo-89/laravel-nginx-proxy-manager-api)
[![Laravel](https://img.shields.io/badge/Laravel-12%20%7C%2013-FF2D20.svg?logo=laravel&logoColor=white)](https://laravel.com/)
[![Total Downloads](https://img.shields.io/packagist/dt/mapo-89/laravel-nginx-proxy-manager-api.svg)](https://packagist.org/packages/mapo-89/laravel-nginx-proxy-manager-api)
[![GitHub Actions](https://github.com/mapo-89/laravel-nginx-proxy-manager-api/actions/workflows/main.yml/badge.svg)](https://github.com/mapo-89/laravel-nginx-proxy-manager-api/actions/workflows/main.yml)
[![GitHub issues](https://img.shields.io/github/issues/mapo-89/laravel-nginx-proxy-manager-api.svg)](https://github.com/mapo-89/laravel-nginx-proxy-manager-api/issues)
[![GitHub stars](https://img.shields.io/github/stars/mapo-89/laravel-nginx-proxy-manager-api.svg?style=flat)](https://github.com/mapo-89/laravel-nginx-proxy-manager-api/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/mapo-89/laravel-nginx-proxy-manager-api.svg)](https://github.com/mapo-89/laravel-nginx-proxy-manager-api/commits/main)

<a href="https://buymeacoffee.com/mapo"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="60"></a>

Laravel integration for the Nginx Proxy Manager REST API, with proxy host and
certificate management, optional response caching and two-factor authentication.

## Requirements

- PHP 8.4 or newer
- Laravel 12 or 13
- An Nginx Proxy Manager instance and API credentials

NPM 2.16.0 is the pinned real-integration-test baseline. See the
[public API contract](API.md) for compatibility and stability boundaries, and
the [v1.0 readiness checklist](V1_READINESS.md) for outstanding release evidence.

## Installation

```bash
composer require mapo-89/laravel-nginx-proxy-manager-api
```

Laravel discovers the service provider and facade automatically. Configure your
installation in `.env`:

```env
NPM_URL=https://npm.example.com
NPM_EMAIL=admin@example.com
NPM_PASSWORD=your_password
```

The URL may include `/api`; the client adds it when needed.

## Configuration

Optionally publish `config/nginx-proxy-manager-api.php`:

```bash
php artisan vendor:publish --tag=nginx-proxy-manager-api-config
```

| Option | Environment variable | Default | Purpose |
| --- | --- | --- | --- |
| `base_url` | `NPM_URL` | — | Nginx Proxy Manager URL. |
| `email` | `NPM_EMAIL` | — | Login email. |
| `password` | `NPM_PASSWORD` | — | Login password. |
| `connect_timeout` | `NPM_CONNECT_TIMEOUT` | `3` | Connection timeout in seconds. |
| `timeout` | `NPM_TIMEOUT` | `15` | Request timeout in seconds. |
| `token_cache_ttl` | `NPM_TOKEN_CACHE_TTL` | `30` | Login token cache lifetime in minutes. |
| `cache_responses` | `NPM_CACHE_RESPONSES` | `false` | Cache successful GET responses. |
| `response_cache_ttl` | `NPM_RESPONSE_CACHE_TTL` | `300` | GET response cache lifetime in minutes. |

After changing environment variables in a deployment using Laravel's configuration
cache, rebuild it with `php artisan config:cache`.

## Usage

```php
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;

$npm = NginxProxyManagerApi::make();

// For a separate installation, supply its URL and credentials.
$npm = NginxProxyManagerApi::make([
    'url' => 'https://npm.example.com',
    'email' => 'admin@example.com',
    'password' => 'your_password',
]);
```

The array passed to `make()` accepts the configuration options above, using
`url` in place of `base_url`. It also accepts `token` for an existing bearer token.

### Health

```php
$health = $npm->health()->check();
```

### Proxy hosts

```php
$hosts = $npm->hosts('proxy');

$all = $hosts->all();
$host = $hosts->find(7);

$created = $hosts->create([
    'domain_names' => ['app.example.com'],
    'forward_scheme' => 'http',
    'forward_host' => '192.168.1.10',
    'forward_port' => 8080,
]);

$updated = $hosts->update(7, [
    'domain_names' => ['app.example.com'],
    'forward_port' => 8081,
]);

$hosts->delete(7);
```

Host creation requires a nonempty `domain_names` array. Updates accept only the
fields you want to change; `domain_names` must be nonempty when supplied. Set
`certificate_id` or `access_list_id` to `0` to remove the respective association.
Proxy hosts also support SSL, HSTS, HTTP/2, access lists, custom locations and
advanced configuration. Forwarding ports must be between `1` and `65535`.
Resource reads, creation and updates return response arrays. Deletion returns
the decoded NPM result, which can be a boolean.

Set `trust_forwarded_proto` to `true` or `false` when creating or updating a host
to control whether Nginx Proxy Manager trusts the forwarded protocol header.
The field is only sent when supplied, so older NPM versions remain usable without
this option.

Custom locations use a list of arrays, each with `path`, `forward_scheme`,
`forward_host` and `forward_port`. Each port must be between `1` and `65535`.
Optional fields are `id` (which may be `null`), `forward_path`, `advanced_config`
and `access_list_id`. Supply `'locations' => []` in an update to remove all custom
locations.

Use `hosts('redirection')` or `hosts('dead')` to list, find, update or delete those
host types. `create()` currently supports proxy hosts only.

### Certificates

```php
$certificates = $npm->certs()->all();

$certificate = $npm->certs()->create([
    'provider' => 'letsencrypt',
    'domain_names' => ['app.example.com'],
    'meta' => [
        'letsencrypt_email' => 'admin@example.com',
        'letsencrypt_agree' => true,
    ],
]);

$npm->certs()->renew('7');
```

### Two-factor authentication and sessions

For an account with two-factor authentication, exchange the current code for a
session token, then pass that token to the API client:

```php
use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;

$client = new ApiClient;
$session = $client->authenticate('012345');

$npm = NginxProxyManagerApi::make([
    'url' => config('nginx-proxy-manager-api.base_url'),
    'token' => $session['token'],
]);

$hosts = $npm->hosts()->all();

// Keep the returned token and expiry for subsequent requests.
$renewed = $client->refreshToken($session['token']);
```

`refreshToken()` only needs the instance URL and the supplied nonempty session
token; login credentials are not required for renewal.

`authenticate()` returns `token`, `expires` and `two_factor`. A login that requires
a code throws `TwoFactorRequiredException` when no code is supplied. Login tokens
are cached for regular email/password authentication; explicit bearer tokens are
used directly. Failed requests with an explicit token are not retried.

### Response caching and errors

GET response caching is optional and uses Laravel's cache store. Cached responses
remain until their configured lifetime expires; writes do not invalidate them.
Disable response caching when subsequent reads must reflect writes immediately.

Invalid host data throws `Illuminate\Validation\ValidationException`.
Authentication and API failures throw `RuntimeException`; authentication without
a required two-factor code throws
`Mapo89\LaravelNginxProxyManagerApi\Api\Utils\TwoFactorRequiredException`.
A repeated HTTP 401 after automatic email/password reauthentication throws
`Illuminate\Validation\UnauthorizedException`.

## Development

```bash
composer install
composer qa
```

Tests use simulated API responses and do not need a running Nginx Proxy Manager
instance by default. Run `composer test` for these tests or `composer format` to
apply PHP style fixes. CI also provisions a disposable NPM instance and runs
`composer test:integration` for real API/2FA checks. See the
[integration instructions](V1_READINESS.md#running-the-real-integration-test).
CI checks formatting without creating commits.

See [CONTRIBUTING](CONTRIBUTING.md) and the [release guide](.release/README.md)
for development, dependency updates and releases. Changes are listed in
[CHANGELOG](CHANGELOG.md).

## Security

Report security issues to [info@postler.de](mailto:info@postler.de).

## Credits and license

- [Manuel Postler](https://github.com/mapo-89)
- [All contributors](../../contributors)

Licensed under the [MIT License](LICENSE.md).
