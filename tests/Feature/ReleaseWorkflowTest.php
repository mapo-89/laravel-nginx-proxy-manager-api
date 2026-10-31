<?php

use Symfony\Component\Yaml\Yaml;

it('publishes only successful trusted main pushes or manually verified commits', function () {
    $workflow = Yaml::parseFile(dirname(__DIR__, 2).'/.github/workflows/release.yml');
    $trigger = $workflow['on']['workflow_run'];
    $release = $workflow['jobs']['release'];
    $steps = collect($release['steps']);
    $checkout = $steps->first(fn ($step) => str_starts_with($step['uses'] ?? '', 'actions/checkout@'));
    $manual = $steps->firstWhere('name', 'Verify CI for manual release');
    $publishIndex = $steps->search(fn ($step) => str_contains($step['run'] ?? '', 'gh release create'));
    $manualIndex = $steps->search(fn ($step) => $step['name'] === 'Verify CI for manual release');

    expect($trigger['workflows'])->toBe(['run-tests'])
        ->and($trigger['types'])->toBe(['completed'])
        ->and($trigger['branches'])->toBe(['main'])
        ->and($workflow['on'])->not->toHaveKey('push')
        ->and($release['if'])->toContain(
            "github.event_name == 'workflow_dispatch'",
            "github.event.workflow_run.conclusion == 'success'",
            "github.event.workflow_run.event == 'push'",
            'github.event.workflow_run.head_repository.full_name == github.repository',
        )
        ->and($checkout['with']['ref'])->toBe('${{ github.event.workflow_run.head_sha || github.sha }}')
        ->and($checkout['with']['persist-credentials'])->toBeFalse()
        ->and($manual['env']['RELEASE_SHA'])->toBe('${{ steps.plan.outputs.sha }}')
        ->and($manual['if'])->toContain("github.event_name == 'workflow_dispatch'")
        ->and($manual['run'])->toContain('--workflow main.yml', '--commit "$RELEASE_SHA"', '--event push', 'exit 1')
        ->and($publishIndex)->not->toBeFalse()
        ->and($manualIndex)->not->toBeFalse()
        ->and($manualIndex)->toBeLessThan($publishIndex);

    expect($release['continue-on-error'] ?? false)->toBeFalse();

    foreach ($steps as $step) {
        expect($step['continue-on-error'] ?? false)->toBeFalse();
    }
});

it('includes every required check in the CI workflow that authorizes publication', function () {
    $workflow = Yaml::parseFile(dirname(__DIR__, 2).'/.github/workflows/main.yml');
    $matrix = $workflow['jobs']['test']['strategy']['matrix'];

    expect($workflow['name'])->toBe('run-tests')
        ->and($workflow['on']['push']['branches'])->toBe(['main', 'release/**'])
        ->and($workflow['on']['push'])->not->toHaveKey('paths')
        ->and($workflow['jobs'])->toHaveKeys(['quality', 'release-tooling', 'test'])
        ->and($matrix['php'])->toBe(['8.4', '8.5'])
        ->and($matrix['laravel'])->toBe(['12.*', '13.*'])
        ->and($matrix['stability'])->toContain('prefer-stable', 'prefer-lowest');

    $qualityCommands = implode("\n", array_column($workflow['jobs']['quality']['steps'], 'run'));
    $releaseCommands = implode("\n", array_column($workflow['jobs']['release-tooling']['steps'], 'run'));

    expect($qualityCommands)->toContain('composer check-autoload', 'composer check-style', 'composer analyse', 'composer audit')
        ->and($releaseCommands)->toContain('check-pr', 'check-commits', 'node --test', 'git fetch --no-tags origin "$BASE_SHA"');

    foreach ($workflow['jobs'] as $job) {
        expect($job['continue-on-error'] ?? false)->toBeFalse();

        foreach ($job['steps'] as $step) {
            expect($step['continue-on-error'] ?? false)->toBeFalse();
        }
    }
});

it('runs guarded cleanup only after publication and tagged changelog verification', function () {
    $workflow = Yaml::parseFile(dirname(__DIR__, 2).'/.github/workflows/release.yml');
    $steps = collect($workflow['jobs']['release']['steps']);
    $publishIndex = $steps->search(fn ($step) => str_contains($step['run'] ?? '', 'gh release create'));
    $verifyIndex = $steps->search(fn ($step) => str_contains($step['run'] ?? '', '.release/publish-changelog.mjs'));
    $cleanupIndex = $steps->search(fn ($step) => str_contains($step['run'] ?? '', '.release/cleanup.mjs'));

    expect($publishIndex)->not->toBeFalse()
        ->and($verifyIndex)->not->toBeFalse()
        ->and($cleanupIndex)->not->toBeFalse()
        ->and($cleanupIndex)->toBeGreaterThan($verifyIndex)
        ->and($verifyIndex)->toBeGreaterThan($publishIndex)
        ->and($steps[$cleanupIndex]['if'])->not->toContain('always(', 'failure(', 'cancelled(')
        ->and($steps[$cleanupIndex]['run'])->toContain('--release-file', '--open-prs-file');
});

it('requires real NPM integration as part of the aggregate CI gate', function () {
    $workflow = Yaml::parseFile(dirname(__DIR__, 2).'/.github/workflows/main.yml');
    $integration = $workflow['jobs']['integration'];
    $gate = $workflow['jobs']['ci'];
    $gateStep = $gate['steps'][0];
    $composer = json_decode(file_get_contents(dirname(__DIR__, 2).'/composer.json'), true);

    expect($integration['strategy']['matrix']['npm'])->toBe(['2.16.0'])
        ->and($integration['strategy']['matrix']['php'])->toBe(['8.4', '8.5'])
        ->and($integration['strategy']['matrix']['laravel'])->toBe(['12.*', '13.*'])
        ->and($integration['services']['npm']['image'])->toBe('jc21/nginx-proxy-manager:${{ matrix.npm }}')
        ->and(implode("\n", array_column($integration['steps'], 'run')))->toContain('composer test:integration')
        ->and($composer['scripts']['test'])->toContain('--exclude-group=integration')
        ->and($composer['scripts']['test:integration'])->toContain('--group=integration')
        ->and($gate['name'])->toBe('CI gate')
        ->and($gate['if'])->toBe('always()')
        ->and($gate['needs'])->toContain('quality', 'release-tooling', 'test', 'integration');

    foreach ($gate['needs'] as $job) {
        $expression = '${{ needs.'.$job.'.result }}';
        $variable = array_search($expression, $gateStep['env'], true);
        expect($variable)->not->toBeFalse();
        expect($gateStep['run'])->toContain('test "$'.$variable.'" = success');
    }
});
