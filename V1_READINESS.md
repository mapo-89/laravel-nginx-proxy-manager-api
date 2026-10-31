# Version 1.0 readiness

This is a verification checklist, not a release authorization. The working
branch and version/changelog metadata stay unchanged until release finalization.

## Implemented prerequisites

- [x] Define the intended [public API contract](API.md), including failure types,
  retries, cache units, compatibility and unsupported operations.
- [x] Add certificate list/create/renew regression tests, including HTTP errors,
  credential redaction and transport errors.
- [x] Add real NPM integration coverage for login, renewal, proxy-host CRUD,
  custom locations, certificate operations and a newly provisioned 2FA account.
- [x] Pin the live-server baseline to `jc21/nginx-proxy-manager:2.16.0`.
- [x] Configure PHP 8.4/8.5 and Laravel 12/13 test matrices; keep Pest 4.
- [x] Add a `CI gate` that fails when any required job fails, is cancelled or is
  skipped. The Release workflow still requires successful CI for its exact SHA.

## Evidence required before declaring 1.0 ready

- [x] A successful `run-tests` workflow for the implemented release candidate:
  quality, release tooling, the full lowest/stable PHP matrix and all real NPM
  integration jobs. See the recorded live evidence below.
- [ ] A reviewer accepts the documented API boundaries and NPM support baseline.
- [ ] GitHub enforces the intended main-branch rules below.
- [ ] Only after the scope is final: authorize the target version, use its
  `release/X.Y.Z` branch, run `prepare` once, and validate the prepared release.

The live test does not request public certificates or contact Let's Encrypt.
Successful ACME issuance/renewal requires a separate controlled environment with
appropriate domain/provider access if that behavior is part of the deployment's
acceptance criteria. It is not claimed as verified by this CI container.

## Verified CI evidence

On 2026-10-31, [workflow run 41185644157](https://github.com/mapo-89/laravel-nginx-proxy-manager-api/actions/runs/41185644157)
passed all 15 jobs for implementation commit `8090406669a140f16a8c58034bcb26813dbeffb2`:

- Quality checks, dependency audit and release-tooling tests.
- Eight PHP 8.4/8.5, Laravel 12/13, lowest/stable test combinations.
- Four real NPM 2.16.0 integration combinations, including 2FA and cleanup.
- The aggregate `CI gate`.

The workflow fixes include required disposable NPM storage mounts and reading
persisted host activation status after creation. Later changes and the final
prepared release commit must receive their own successful CI run; this record
does not authorize publication.

## GitHub main-branch settings

The visible active `main` ruleset was inspected on 2026-10-31. It requires a PR
and one approval, but contains no required-status-check rule and allows merge,
squash and rebase. Classic branch protection could not be inspected through the
current GitHub connection (administration access is unavailable).

An administrator should verify the combined rules and configure:

1. Required status check: **CI gate** from `main.yml` (GitHub Actions).
2. Require the branch to include the latest main before merging.
3. Require a reviewed PR and preserve the existing approval requirement.
4. Allow release PRs to reach main through a **merge commit**, never squash or
   rebase. The repository policy prohibits using administrator bypasses.

The aggregate check covers `Code quality`, `Commit conventions and release
tooling`, every PHP matrix job and every live NPM integration job. Requiring it
avoids maintaining a separate required-check name for every matrix combination.

No hosted protection setting is changed by committing these files. These rules
must be verified by an administrator before v1.0 release approval.

## Running the real integration test

Use a dedicated, disposable NPM 2.16.0 instance initialized with
`INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`. CI provisions one automatically
for each PHP/Laravel combination. The test creates uniquely named resources and
a temporary administrator for 2FA; it does not modify the supplied admin's 2FA.
Cleanup attempts to remove every resource it created, even on failure.

For an already provisioned test instance, configure these process environment
variables without committing credentials:

```bash
export NPM_TEST_URL=http://127.0.0.1:18081
export NPM_TEST_EMAIL=admin@example.test
export NPM_TEST_PASSWORD=your_disposable_test_password
composer test:integration
```

The explicit integration command fails when configuration is missing. Ordinary
`composer test`, coverage and `composer qa` exclude the integration group and
need no NPM server. Do not point the live suite at a production instance.

The CI image tag controls the tested NPM version. The health endpoint reads its
version from NPM's backend package metadata and is not treated as proof of the
Docker build version. For external test instances, the operator must verify the
deployed image version.
