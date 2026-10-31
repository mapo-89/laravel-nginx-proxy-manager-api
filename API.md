# Public API contract

This document defines the intended stable API for the first 1.0 release. It is a
release candidate contract until that release is explicitly approved and tagged.
No version is prepared by writing this document.

## Compatibility

| Component | Contract and verification |
| --- | --- |
| PHP | Minimum 8.4; CI covers 8.4 and 8.5. |
| Laravel | 12 and 13; Laravel 11 is not supported. |
| Nginx Proxy Manager | 2.16.0 is the pinned live-test baseline. Compatibility is verified when the real integration CI passes, not by mocked tests alone. |
| Pest | Version 4 is a development dependency. It is not required by consumers. |

Older NPM versions are not part of the verified compatibility promise. New NPM
versions must pass the live suite before they are added to the support matrix.
The optional `trust_forwarded_proto` field is omitted unless supplied.

## Client construction and Laravel integration

The primary class is
`Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi`:

```php
use Mapo89\LaravelNginxProxyManagerApi\Api\Utils\ApiClient;
use Mapo89\LaravelNginxProxyManagerApi\NginxProxyManagerApi;

$api = NginxProxyManagerApi::make();
$api = NginxProxyManagerApi::make(['url' => $url, 'token' => $token]);
$api = new NginxProxyManagerApi(new ApiClient($configuration));
```

`make(?array $config = null)` returns a new independent client. The constructor
accepts an optional `ApiClient`; omitting it uses package configuration. Array
overrides are merged with that configuration. They use `url`, whereas the
published configuration file uses `base_url`.

Laravel discovers the provider and
`Mapo89\LaravelNginxProxyManagerApi\Facades\NginxProxyManagerApi` facade through
Composer metadata. The facade alias is `LaravelNginxProxyManagerApi`. The config
file is `config/nginx-proxy-manager-api.php`; its publish tag is
`nginx-proxy-manager-api-config`.

The configuration keys, environment variables, defaults and units in the
[README configuration table](README.md#configuration) are public API. Cache
lifetimes are in **minutes**; connection/request timeouts are in **seconds**.
Login requires URL, email and password; an explicit nonempty bearer token can
replace email/password for resource calls. URL normalization accepts a trailing
slash and adds `/api` when necessary.

## Resources

Resources are obtained through `health()`, `hosts($type = 'proxy')` and `certs()`.
Their successful array results are decoded upstream responses, not package model
instances. Upstream response fields can vary with NPM; new upstream fields are
passed through. The package does not promise a fixed DTO for every NPM field.

| Resource | Public methods | Result |
| --- | --- | --- |
| Health | `check()` | Array containing NPM health data. |
| Hosts | `all()`, `find(int $id)` | Response array. |
| Hosts | `create(array|string $firstArg, array $data = [])` | Created host response array. |
| Hosts | `update(int $id, array $data)` | Updated host response array. |
| Hosts | `delete(int $id)` | Decoded upstream result, which can be a boolean. |
| Certificates | `all()` | Certificate response array. |
| Certificates | `create(array $data = [])` | Created certificate response array. |
| Certificates | `renew(string $certiId)` | Renewed certificate response array. |

`hosts()` accepts the constants in `Constants\ProxyType`: `PROXY` (`proxy`),
`REDIRECTION` (`redirection`) and `DEAD` (`dead`). Listing, finding, updating and
deleting those resources are exposed; creation currently supports proxy hosts
only. The live suite verifies proxy hosts. Other host types are not yet covered
by the real-server compatibility claim.

Prefer `hosts()->create($data)`. The existing overload
`hosts()->create('proxy', $data)` remains supported. Creation requires a nonempty
`domain_names` list. Updates send only supplied fields and reject empty updates;
supplied domains must still be nonempty. A certificate/access-list ID of `0`
removes that association. Forwarding ports are integers from 1 through 65535.

Supported proxy-host fields are `domain_names`, `forward_scheme`, `forward_host`,
`forward_port`, `certificate_id`, `ssl_forced`, `hsts_enabled`, `hsts_subdomains`,
`trust_forwarded_proto`, `http2_support`, `block_exploits`, `caching_enabled`,
`allow_websocket_upgrade`, `access_list_id`, `advanced_config`, `enabled`, `meta`
and `locations`. Metadata is serialized as a JSON object, including when empty.
Custom locations and their required/optional fields follow the
[README](README.md#proxy-hosts). An empty location list clears them.

Certificate payloads are passed through to NPM. Provider-specific validation,
certificate issuance and successful ACME renewal remain NPM/provider concerns.
The live suite creates/lists a custom certificate and verifies rejection of its
renewal; successful Let's Encrypt issuance/renewal is covered by mocked contract
tests, not an external ACME service in CI.

## Authentication and low-level HTTP

The public low-level class is `Api\Utils\ApiClient`:

| Method | Contract |
| --- | --- |
| `__construct(?array $config = null)` | Same configuration overrides as `make()`. |
| `getToken(): string` | Explicit token or cached email/password login token. |
| `authenticate(?string $code = null): array` | Returns `token`, `expires`, `two_factor`. |
| `refreshToken(string $token): array` | Returns `token`, `expires`; needs only URL and a nonblank token. |
| `execute(string $method, string $endpoint = '', array $parameters = [], bool $asArray = true): mixed` | Accepts GET, POST, PUT, PATCH and DELETE, case-insensitively. |
| `get/post/put/patch/delete(string $url = '', array $parameters = [], bool $asArray = true): mixed` | Convenience methods for `execute()`. |

The default low-level result is JSON decoded with objects represented as
associative arrays. JSON primitives remain primitives. `asArray: false` returns
the raw response body. Authentication methods validate that NPM returned a
nonempty token. `authenticate()` returns a session but does not populate the
automatic login cache; pass its token explicitly after completing 2FA.

Email/password authentication retries a resource request **once** after HTTP 401,
using a newly obtained token. This also applies to writes rejected with 401.
Explicit bearer requests are never automatically retried. Timeouts and other
HTTP errors are not automatically retried by this package.

## Caching and failures

Login tokens are isolated by normalized instance URL, email and password.
Response caching is opt-in and applies only to GET requests. It is isolated by
request/configuration identity and representation. Successful writes do not
invalidate previously cached reads; callers needing immediate read-after-write
consistency must disable response caching. Cache-key formats are internal API.

| Failure | Public exception type |
| --- | --- |
| Missing configuration, unsupported HTTP method, blank renewal token or unsupported creation type | `InvalidArgumentException` |
| Unknown resource method | `BadMethodCallException` |
| Invalid host/location payload | `Illuminate\Validation\ValidationException` |
| Login requires a missing 2FA code | `Api\Utils\TwoFactorRequiredException` (a `RuntimeException`) |
| Repeated HTTP 401 after automatic password reauthentication | `Illuminate\Validation\UnauthorizedException` |
| Other resource HTTP failure or failed authentication/renewal | `RuntimeException` |
| Resource transport/connection failure | `Illuminate\Http\Client\ConnectionException` |

Exceptions from authentication/renewal intentionally wrap transport failures as
generic `RuntimeException`s. Error-message wording and upstream response bodies
are not stable API; do not parse messages to control application behavior.
Provider credentials and raw error bodies are not included in resource HTTP
failure messages.

## Models and stability boundaries

`Models\ProxyHost` and `Models\HostLocation` are data models based on Eloquent.
Their documented fillable attributes, casts and `toArray()` usage are supported;
they are not database persistence APIs. Proxy-host defaults are visible in
`getDefaultAttributes()` in source, but that protected method itself is internal.

Documented public signatures, configuration semantics and exception families
will remain backward compatible within 1.x. Protected/private helpers,
undocumented dynamic resources, cache-key formats and implementation inheritance
are not extension contracts. New resources and optional fields may be added in
minor versions. Breaking public changes require a new major version; deprecated
APIs receive documentation before removal.
