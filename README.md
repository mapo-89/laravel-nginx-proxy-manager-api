# Laravel API client for Nginx Proxy Manager

[![Latest Version on Packagist](https://img.shields.io/packagist/v/mapo-89/laravel-nginx-proxy-manager.svg?style=flat-square)](https://packagist.org/packages/mapo-89/laravel-nginx-proxy-manager)
[![GitHub Tests Action Status](https://img.shields.io/github/actions/workflow/status/mapo-89/laravel-nginx-proxy-manager/run-tests.yml?branch=main&label=tests&style=flat-square)](https://github.com/mapo-89/laravel-nginx-proxy-manager/actions?query=workflow%3Arun-tests+branch%3Amain)
[![GitHub Code Style Action Status](https://img.shields.io/github/actions/workflow/status/mapo-89/laravel-nginx-proxy-manager/fix-php-code-style-issues.yml?branch=main&label=code%20style&style=flat-square)](https://github.com/mapo-89/laravel-nginx-proxy-manager/actions?query=workflow%3A"Fix+PHP+code+style+issues"+branch%3Amain)
[![Total Downloads](https://img.shields.io/packagist/dt/mapo-89/laravel-nginx-proxy-manager.svg?style=flat-square)](https://packagist.org/packages/mapo-89/laravel-nginx-proxy-manager)

A simple Laravel package to interact with the Nginx Proxy Manager API.

This package provides a lightweight API client for communicating with the Nginx Proxy Manager REST API from Laravel applications.

## Installation

Install the package via Composer:

```bash
composer require mapo-89/laravel-nginx-proxy-manager-api
```

Publish the configuration file:

```bash
php artisan vendor:publish --tag="nginx-proxy-manager-config-api"
```

Then configure your .env:

```bash
NPM_API_BASE_URL=https://npm.example.com/api
NPM_API_EMAIL=admin@example.com
NPM_API_PASSWORD=secret
```

Example config (`config/nginx-proxy-manager-api.php`):

```php
return [
    'base_url' => env('NPM_URL'),
    'email' => env('NPM_EMAIL'),
    'password' => env('NPM_PASSWORD'),
    'token_cache_ttl' => env('NPM_TOKEN_CACHE_TTL', 30),
];
```

## Usage

```php
$npmApi = new Mapo89\NginxProxyManagerApi();
$npmApi->health()->check();
```

## API Structure

The package is structured using resource classes.

Example:

```php
$npm->health()->check();

$npm->hosts('proxy')->all();
$npm->hosts('redirection')->all();
$npm->hosts('dead')->all();

$npm->certificates()->all();
```
This structure makes it easy to interact with the Nginx Proxy Manager API in a fluent and Laravel-friendly way.


## Testing

```bash
composer test
```

or 

```bash
vendor/bin/pest
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) for details.

## Security Vulnerabilities

Please review [our security policy](../../security/policy) on how to report security vulnerabilities.

## Credits

- [mapo-89](https://github.com/mapo-89)
- [All Contributors](../../contributors)

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
