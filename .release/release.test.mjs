import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fixture } from './fixture.mjs'
import { checkCommits, compareVersions, planRelease, releaseNotes, renderNotes, validSubject } from './release.mjs'
const script = fileURLToPath(new URL('./release.mjs', import.meta.url))

test('existing Refactor commits remain valid and appear under Refactoring', () => {
    const subject = '♻️ Refactor: Adopt Spatie Laravel Package Tools'
    assert.equal(validSubject(subject), true)
    const notes = renderNotes('v2.0.0', [subject])
    assert.ok(notes.includes('### ♻️ Refactoring\n- Adopt Spatie Laravel Package Tools'))
    assert.ok(!notes.includes('Other Changes'))
})

test('Core-Panel category order, historical fallback, and automation filtering', context => {
    const f = fixture(context); f.git('tag', 'v1.0.0')
    for (const subject of ['🐛 Fix: Handle unreadable images', '✨ Feature: Decode WebP', '♻️ Refactoring: Use package tools',
        '📝 Docs: Explain installation', '💄 UI: Improve output', '🔒 Security: Protect tokens', '⚡ Performance: Reuse cached data',
        '⚠️ Deprecated: Retire old option', '🔥 Remove: Remove old option', '📦 Deps: Update package tools',
        '🚀 Deploy: Publish package', 'old unclassified change', '🧪 Test: Cover command registration',
        '⚙️ Chore: set version to 1.1.0', '🚀 Release: minor']) f.commit(subject)
    const notes = releaseNotes('v1.1.0')
    const positions = ['✨ Features', '🐛 Fixes', '♻️ Refactoring', '🎨 UI & Styling', '📝 Documentation', '🔒 Security',
        '⚡ Performance', '⚠️ Deprecated', '🔥 Removed', '🔧 Chores', '🚀 Deployment', '📌 Other Changes'].map(heading => notes.indexOf('### ' + heading))
    assert.ok(positions.every(position => position >= 0)); assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
    for (const expected of ['- Decode WebP', '- old unclassified change', '- Cover command registration']) assert.ok(notes.includes(expected))
    for (const excluded of ['Initial decoder', 'set version', 'Release: minor']) assert.ok(!notes.includes(excluded))
})

test('notes use the previous ancestor tag and exclude future tags', context => {
    const f = fixture(context); f.git('tag', '1.0.0'); f.commit('🐛 Fix: First fix'); f.git('tag', 'v1.0.1')
    const ref = f.git('rev-parse', 'HEAD'); f.commit('🐛 Fix: Future fix'); f.git('tag', 'v1.0.2')
    const notes = releaseNotes('v1.0.1', ref)
    assert.ok(!notes.includes('Initial decoder')); assert.ok(notes.includes('First fix')); assert.ok(!notes.includes('Future fix'))
})

test('unrelated tags do not set the release base', context => {
    const f = fixture(context); f.git('tag', 'v1.0.0'); f.git('checkout', '-q', '--orphan', 'unrelated')
    f.commit('✨ Feature: Unrelated project'); f.git('tag', 'v9.0.0'); f.git('checkout', '-q', 'main'); f.commit('🐛 Fix: Real fix')
    const notes = releaseNotes('v1.0.1')
    assert.ok(notes.includes('Real fix')); assert.ok(!notes.includes('Initial decoder')); assert.equal(planRelease('manual').tag, 'v1.0.1')
})

test('release notes omit previous-version context in both languages', context => {
    fixture(context)
    for (const language of ['en', 'de']) {
        const notes = renderNotes('1.1.0', ['🐛 Fix: Correct timeout'], 'v1.0.0', { language })
        assert.ok(notes.startsWith('# Release-Notes 1.1.0\n\n### '))
        assert.ok(notes.includes('- Correct timeout'))
        assert.ok(!notes.includes('Changes since')); assert.ok(!notes.includes('Änderungen seit'))
        assert.ok(!notes.includes('v1.0.0')); assert.ok(!notes.includes('Unreleased'))
    }
})

test('initial notes and empty releases', context => {
    const f = fixture(context); assert.ok(releaseNotes('v1.0.0').includes('Initial release.')); assert.ok(releaseNotes('v1.0.0').includes('Initial decoder'))
    f.git('tag', 'v1.0.0'); f.commit('🚀 Release:'); assert.ok(releaseNotes('v1.0.1').includes('No user-facing changes detected'))
})

test('normal commits and marker text in descriptions never trigger a release', context => {
    const f = fixture(context); assert.equal(planRelease('push').should_release, 'false')
    f.commit('🔧 Chore: Explain 🚀 Release: in documentation'); assert.equal(planRelease('push').should_release, 'false')
})

test('explicit markers, bumps and exact versions', context => {
    const f = fixture(context); f.git('tag', 'v1.2.3')
    for (const [marker, version] of [['', '1.2.4'], ['patch', '1.2.4'], ['minor', '1.3.0'], ['major', '2.0.0'], ['2.4.0', '2.4.0'], ['v2.5.0', '2.5.0']]) {
        f.commit('🚀 Release:' + (marker ? ' ' + marker : '')); assert.equal(planRelease('push').version, version)
    }
})

test('manual version overrides, first release, and strict SemVer', context => {
    const f = fixture(context); assert.equal(planRelease('manual').version, '1.0.0'); f.git('tag', 'v1.0.0'); f.commit('🐛 Fix: Another fix')
    assert.equal(planRelease('manual', 'major', 'v3.2.1').version, '3.2.1')
    for (const invalid of ['1.0.0-beta', '1.0', '01.2.3', '1.0.0\nforged=true', '1.0.0\n']) assert.throws(() => planRelease('manual', 'patch', invalid))
    assert.throws(() => planRelease('manual', 'patch', '0.9.0')); assert.throws(() => planRelease('manual', 'auto'))
    assert.equal(compareVersions('9007199254740993.0.0', '9007199254740992.0.0'), 1)
})

test('tags are immutable and workflow retries are idempotent', context => {
    const f = fixture(context); f.git('tag', 'v1.0.0'); f.commit('🚀 Release: minor')
    const original = planRelease('push'); f.git('tag', original.tag); assert.equal(planRelease('push').tag, original.tag)
    f.commit('🐛 Fix: Subsequent change'); assert.throws(() => planRelease('manual', 'patch', '1.1.0'))
})

test('repository config preserves prefix, language, and excluded tags', context => {
    const f = fixture(context); f.configure({ language: 'de', tag_prefix: '', ignore_tags: ['v2.34.0'] }); f.git('tag', 'v2.34.0')
    assert.equal(planRelease('manual').tag, '1.0.0'); const notes = releaseNotes('1.0.0')
    assert.ok(notes.includes('Neue Funktionen')); assert.ok(notes.includes('Erste Veröffentlichung'))
})

test('skip-release postpones publication but retains the change in later notes', context => {
    const f = fixture(context); f.git('tag', 'v1.0.0'); f.commit('🐛 Fix: Correct timeout [skip release]')
    assert.equal(planRelease('push').should_skip, 'true'); assert.ok(releaseNotes('v1.0.1').includes('Correct timeout'))
})

test('zero base checks the initial push tip without rejecting legacy history', context => {
    const f = fixture(context); f.commit('old unclassified history'); f.commit('📝 Docs: Explain releases')
    const result = f.cli(script, ['check-commits', '--base', '0'.repeat(40)]); assert.equal(result.status, 0, result.stderr)
})

test('generated successor version commits allow safe retries', context => {
    const f = fixture(context); f.configure({ version_commit: true }); f.git('tag', 'v1.0.0'); f.commit('🚀 Release: patch')
    const ref = f.git('rev-parse', 'HEAD'); f.commit('⚙️ Chore: set version to 1.0.1'); f.git('tag', 'v1.0.1')
    const result = planRelease('push', 'patch', '', ref); assert.equal(result.sha, f.git('rev-parse', 'HEAD')); assert.equal(result.tag, 'v1.0.1')
})

test('JSON version metadata synchronizes without publication', context => {
    const f = fixture(context); writeFileSync('package.json', JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0' } }, name: 'fixture' }))
    f.configure({ version_files: [{ path: 'package.json', keys: ['version', 'packages..version'] }] })
    const result = f.cli(script, ['sync', '--version', 'v1.1.0']); assert.equal(result.status, 0, result.stderr)
    const data = JSON.parse(readFileSync('package.json', 'utf8')); assert.equal(data.version, '1.1.0'); assert.equal(data.packages[''].version, '1.1.0')
    assert.equal(data.name, 'fixture'); assert.equal(f.git('tag', '--list'), '')
})

test('release gate rejects other branches', context => {
    const f = fixture(context); const result = f.cli(script, ['gate', '--event', 'manual'], { GITHUB_REF: 'refs/heads/feature/unreleased' })
    assert.equal(result.status, 1); assert.ok(result.stderr.includes('release branch'))
})

test('automatic changelog commits are excluded from product notes', context => {
    const f = fixture(context); f.git('tag', 'v1.0.0'); f.commit('📝 Docs: Update CHANGELOG for v1.0.0'); f.commit('🐛 Fix: Correct decoder timeout')
    const notes = releaseNotes('v1.0.1'); assert.ok(notes.includes('Correct decoder timeout')); assert.ok(!notes.includes('Update CHANGELOG'))
    assert.equal(planRelease('push').should_release, 'false')
})

test('commit convention validates only the new range', context => {
    const f = fixture(context)
    for (const subject of ['🐛 Fix: Correct timeout', '♻️ Refactoring: Use package tools', '🧪 Test: Cover config', '🚀 Release:', '🚀 Release: v2.0.0']) assert.equal(validSubject(subject), true, subject)
    for (const subject of ['fix: Correct timeout', '✨ Feature:', '🚀 Release: banana']) assert.equal(validSubject(subject), false, subject)
    f.commit('legacy old message'); const base = f.git('rev-parse', 'HEAD'); f.commit('📝 Docs: Explain configuration'); checkCommits(base)
    f.commit('fix: Wrong convention'); const result = f.cli(script, ['check-commits', '--base', base]); assert.equal(result.status, 1); assert.ok(result.stderr.includes('Wrong convention'))
})

test('workflow outputs remain compatible and JSON planning has no output-file side effects', context => {
    const f = fixture(context); f.git('tag', 'v1.0.0'); f.commit('🚀 Release: patch')
    const environment = { GITHUB_OUTPUT: 'output.txt', GITHUB_ENV: 'env.txt' }
    const result = f.cli(script, ['plan', '--event', 'push', '--export-env'], environment)
    assert.equal(result.status, 0, result.stderr); assert.ok(readFileSync('output.txt', 'utf8').includes('release_version=1.0.1\n'))
    assert.ok(readFileSync('env.txt', 'utf8').includes('RELEASE_VERSION=1.0.1\n'))
    writeFileSync('output.txt', 'unchanged'); const json = f.cli(script, ['plan', '--event', 'push', '--json'], environment)
    assert.equal(json.status, 0, json.stderr); assert.equal(JSON.parse(json.stdout).tag, 'v1.0.1'); assert.equal(readFileSync('output.txt', 'utf8'), 'unchanged')
})


test('gate defaults to push semantics and cannot release an ordinary commit', context => {
    const f = fixture(context); const result = f.cli(script, ['gate'], { GITHUB_REF: 'refs/heads/main' })
    assert.equal(result.status, 0, result.stderr); assert.ok(result.stdout.includes('should_release=false'))
})
