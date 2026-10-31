# Changelog

All notable changes to `laravel-nginx-proxy-manager` will be documented in this file.

## v1.0.0 - 2026-10-31

Initial release.

### 💥 Breaking Changes
- Align release workflows and require Laravel 12 or newer

### ✨ Features
- Initial Commit
- support dynamic proxy types like (hosts('proxy')->all())
- support full OpenAPI fields including locations, meta, SSL, HSTS, and HTTP2 for ProxyHost
- Add host creation validation and tests
- Add return type hints to ApiClient HTTP methods
- Add shared BaseApi class for API resources
- Add ApiModel base class and centralize default model attributes
- Add optional response caching for API GET requests
- Support Laravel 13 and reliable proxy provisioning
- Support two-factor authentication and renewable API sessions

### 🐛 Fixes
- Serialize host payloads and support partial updates
- Isolate cached API tokens by credentials
- Require PHP validation before publishing releases
- Validate forwarding ports and renew token-only sessions
- Preserve forwarded protocol and validate custom locations
- Resolve NPM service ports in the integration step
- Mount disposable storage for NPM integration containers

### ♻️ Refactoring
- ApiClient with token caching and standard request methods

### 🎨 UI & Styling
- Fix styling

### 📝 Documentation
- Align package README style and correct usage examples
- Record successful NPM compatibility verification
- Record v1 API review and enforced release protections

### 🔧 Chores
- Implement Tests
- Update Commit Message for Code Sytling
- Establish release workflow and repository quality checks
- Update existing workflows to actions checkout 7
- Require Larastan 3.13 for static analysis
- Define v1 API contracts and add real NPM release checks
- Read persisted NPM host status after creation
- Avoid expiring TOTP codes during live authentication
- Require green draft PR checks before release preparation
- Share preparation CI checks across supported hosts

### 📌 Other Changes
- Fix styling
- Fix styling
- Bump dependabot/fetch-metadata from 2.5.0 to 3.0.0
- Update changelog workflow

