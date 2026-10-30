<?php

use Symfony\Component\Yaml\Yaml;

it('requires successful PHP tests and quality checks before publication', function () {
    $workflowDirectory = dirname(__DIR__, 2).'/.github/workflows/';
    $workflow = Yaml::parseFile($workflowDirectory.'release.yml');
    $publishers = array_filter($workflow['jobs'], fn ($job) => collect($job['steps'] ?? [])
        ->contains(fn ($step) => str_contains($step['run'] ?? '', 'gh release create')));

    expect($publishers)->not->toBeEmpty();

    foreach ($publishers as $publisher) {
        $requiredWorkflows = [];

        foreach ((array) $publisher['needs'] as $dependency) {
            $job = $workflow['jobs'][$dependency];

            expect($job['continue-on-error'] ?? false)->toBeFalse();

            if (isset($job['uses'])) {
                $requiredWorkflows[] = $job['uses'];
                $called = Yaml::parseFile(dirname(__DIR__, 2).'/'.substr($job['uses'], 2));

                expect($called['on'])->toHaveKey('workflow_call');

                foreach ($called['jobs'] as $calledJob) {
                    expect($calledJob['continue-on-error'] ?? false)->toBeFalse();

                    foreach ($calledJob['steps'] ?? [] as $step) {
                        expect($step['continue-on-error'] ?? false)->toBeFalse();

                        if (str_starts_with($step['uses'] ?? '', 'actions/checkout@')) {
                            expect($step['with']['ref'] ?? '${{ github.sha }}')->toBe('${{ github.sha }}');
                        }
                    }
                }
            }
        }

        expect($requiredWorkflows)->toContain(
            './.github/workflows/run-tests.yml',
            './.github/workflows/fix-php-code-style-issues.yml',
        );
        expect($publisher['if'])->not->toContain('always(', 'failure(', 'cancelled(');
    }
});
