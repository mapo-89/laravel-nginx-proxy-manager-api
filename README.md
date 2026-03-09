# Laravel API client for Nginx Proxy Manager

[![Latest Version on Packagist](https://img.shields.io/packagist/v/mapo-89/laravel-nginx-proxy-manager.svg?style=flat-square)](https://packagist.org/packages/mapo-89/laravel-nginx-proxy-manager)
[![GitHub Tests Action Status](https://img.shields.io/github/actions/workflow/status/mapo-89/laravel-nginx-proxy-manager/run-tests.yml?branch=main&label=tests&style=flat-square)](https://github.com/mapo-89/laravel-nginx-proxy-manager/actions?query=workflow%3Arun-tests+branch%3Amain)
[![GitHub Code Style Action Status](https://img.shields.io/github/actions/workflow/status/mapo-89/laravel-nginx-proxy-manager/fix-php-code-style-issues.yml?branch=main&label=code%20style&style=flat-square)](https://github.com/mapo-89/laravel-nginx-proxy-manager/actions?query=workflow%3A"Fix+PHP+code+style+issues"+branch%3Amain)
[![Total Downloads](https://img.shields.io/packagist/dt/mapo-89/laravel-nginx-proxy-manager.svg?style=flat-square)](https://packagist.org/packages/mapo-89/laravel-nginx-proxy-manager)

This is where your description should go. Limit it to a paragraph or two. Consider adding a small example.

## Installation

You can install the package via composer:

```bash
composer require mapo-89/laravel-nginx-proxy-manager
```

You can publish the config file with:

```bash
php artisan vendor:publish --tag="nginx-proxy-manager-config"
```

This is the contents of the published config file:

```php
return [
    'base_url' => env('NPM_URL'),
    'email' => env('NPM_EMAIL'),
    'password' => env('NPM_PASSWORD'),
];
```

## Usage

```php
$NginxProxyManagerApi = new Mapo89\LaravelNginxProxyManager();
$NginxProxyManagerApi->health()->check();
```

## Testing

```bash
composer test
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
