import assert from 'node:assert/strict'
import test from 'node:test'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { fixture } from './fixture.mjs'
import { updateChangelog } from './changelog.mjs'
const script = fileURLToPath(new URL('./changelog.mjs', import.meta.url))
const publisher = fileURLToPath(new URL('./publish-changelog.mjs', import.meta.url))
const notes = '# Release-Notes v1.1.0\n\nChanges since `v1.0.0`.\n\n### ♻️ Refactoring\n- Use Package Tools\n'

function snapshot(f, text) {
    writeFileSync('CHANGELOG.md', text); f.git('add', 'CHANGELOG.md'); f.commit('📝 Docs: Record pending changes')
    return f.git('rev-parse', 'HEAD')
}

test('generated notes become a version entry while history remains untouched', context => {
    const f = fixture(context, { initial: false })
    const history = '## 1.0.0 - 2026-01-21\n\n### Added\n- Original release\n'
    const ref = snapshot(f, '# Changelog\n\n## Unreleased\n\n- Pending refactoring\n\n' + history)
    assert.equal(updateChangelog('v1.1.0', notes, '2026-10-29', ref), true)
    const document = readFileSync('CHANGELOG.md', 'utf8')
    assert.ok(document.startsWith('# Changelog\n\n## v1.1.0 - 2026-10-29'))
    assert.ok(!document.includes('Unreleased')); assert.ok(!document.includes('Changes since'))
    assert.ok(document.includes('### ♻️ Refactoring\n- Use Package Tools')); assert.ok(!document.includes('Pending refactoring'))
    assert.ok(document.endsWith(history)); assert.ok(!document.includes('# Release-Notes'))
})

test('newer Unreleased additions are preserved', context => {
    const f = fixture(context, { initial: false })
    const ref = snapshot(f, '# Changelog\n\n## Unreleased\n\n- Released work\n\n## 1.0.0\n\n- Original\n')
    writeFileSync('CHANGELOG.md', readFileSync('CHANGELOG.md', 'utf8').replace('- Released work', '- Newer uncommitted work'))
    updateChangelog('1.1.0', '### 🐛 Fixes\n- Released fix\n', '2026-10-29', ref)
    const document = readFileSync('CHANGELOG.md', 'utf8')
    assert.ok(document.includes('- Newer uncommitted work')); assert.ok(document.includes('## 1.1.0 - 2026-10-29'))
})

test('empty legacy Unreleased headings are removed without a release snapshot', context => {
    fixture(context, { initial: false })
    for (const heading of ['Unreleased', '[Unreleased]', 'Unveröffentlicht', '[Unveröffentlicht]']) {
        const history = '## 1.0.0\n\n- Original release\n'
        writeFileSync('CHANGELOG.md', '# Changelog\n\n## ' + heading + '\n\n' + history)
        updateChangelog('1.1.0', '### Fixes\n- Correct timeout', '2026-10-29')
        const document = readFileSync('CHANGELOG.md', 'utf8')
        assert.ok(document.startsWith('# Changelog\n\n## 1.1.0 - 2026-10-29'))
        assert.ok(document.endsWith(history))
    }
})

test('new changelogs contain only the title and released version entries', context => {
    const f = fixture(context, { initial: false })
    for (const language of ['en', 'de']) {
        f.configure({ language }); rmSync('CHANGELOG.md', { force: true })
        updateChangelog('1.0.0', '### Features\n- Initial package', '2026-10-29')
        const document = readFileSync('CHANGELOG.md', 'utf8')
        assert.ok(document.startsWith((language === 'de' ? '# Änderungsprotokoll' : '# Changelog') + '\n\n## 1.0.0'))
        assert.ok(!document.includes('Unreleased')); assert.ok(!document.includes('Unveröffentlicht'))
    }
})

test('empty headings at end of file and Windows line endings are handled', context => {
    fixture(context, { initial: false })
    for (const ending of ['', '\r\n\r\n']) {
        writeFileSync('CHANGELOG.md', '# Changelog\n\n## Unreleased' + ending)
        updateChangelog('1.0.0', '### Features\n- Initial package', '2026-10-29')
        assert.ok(!readFileSync('CHANGELOG.md', 'utf8').includes('Unreleased'))
    }
})

test('legacy comparison lines are omitted when importing published release notes', context => {
    fixture(context, { initial: false })
    for (const contextLine of ['Changes since `v1.0.0`.', 'Änderungen seit `1.0.0`.']) {
        writeFileSync('CHANGELOG.md', '# Changelog\n')
        updateChangelog('1.1.0', '# Release-Notes 1.1.0\n\n' + contextLine + '\n\n### Fixes\n- Correct timeout', '2026-10-29')
        assert.equal(readFileSync('CHANGELOG.md', 'utf8'), '# Changelog\n\n## 1.1.0 - 2026-10-29\n\n### Fixes\n- Correct timeout\n\n')
    }
})

test('existing manual or published versions remain immutable', context => {
    fixture(context, { initial: false })
    const original = '# Changelog\n\n## [1.1.0] - 2026-01-21\n\n- Historical manual note\n'
    writeFileSync('CHANGELOG.md', original)
    assert.equal(updateChangelog('v1.1.0', '### Fixes\n- Different content', '2026-10-29'), false)
    assert.equal(readFileSync('CHANGELOG.md', 'utf8'), original)
})

test('local CLI creates a missing file and never creates commits or tags', context => {
    const f = fixture(context, { initial: false }); f.commit('✨ Feature: Initial package'); const before = f.git('rev-parse', 'HEAD')
    writeFileSync('notes.md', '# Release-Notes 1.0.0\n\n### ✨ Features\n- Initial package\n')
    const args = ['--version', '1.0.0', '--notes-file', 'notes.md', '--date', '2026-10-29']
    let result = f.cli(script, args); assert.equal(result.status, 0, result.stderr); const first = readFileSync('CHANGELOG.md', 'utf8')
    result = f.cli(script, args); assert.equal(result.status, 0, result.stderr); assert.equal(readFileSync('CHANGELOG.md', 'utf8'), first)
    assert.equal(f.git('rev-parse', 'HEAD'), before); assert.equal(f.git('tag', '--list'), ''); assert.ok(first.includes('## 1.0.0 - 2026-10-29'))
})

function publicationFixture(context) {
    const f = fixture(context, { initial: false }); const remote = join(f.directory, 'remote.git')
    f.git('init', '-q', '--bare', remote); mkdirSync('.release')
    for (const name of ['release.mjs', 'categories.json', 'changelog.mjs', 'publish-changelog.mjs']) copyFileSync(new URL('./' + name, import.meta.url), '.release/' + name)
    writeFileSync('.release/config.json', '{}'); writeFileSync('CHANGELOG.md', '# Changelog\n\n## Unreleased\n\n- Released work\n')
    f.git('add', '.release', 'CHANGELOG.md'); f.commit('🚀 Release: 1.0.0'); f.git('tag', 'v1.0.0'); f.git('remote', 'add', 'origin', remote)
    f.git('push', '-q', 'origin', 'main', 'v1.0.0'); const tagSha = f.git('rev-parse', 'v1.0.0')
    writeFileSync('user-work.txt', 'Keep this newer work.\n'); f.git('add', 'user-work.txt'); f.commit('🐛 Fix: Preserve user work')
    const userSha = f.git('rev-parse', 'HEAD'); f.git('push', '-q', 'origin', 'main')
    const notesFile = join(f.directory, 'notes.md'); writeFileSync(notesFile, '# Release-Notes v1.0.0\n\n### ✨ Features\n- Initial release\n')
    return { ...f, remote, tagSha, userSha, publish: () => f.cli(publisher, ['1.0.0', notesFile, 'main', 'v1.0.0']) }
}

test('publication fast-forwards, preserves user work and is idempotent', context => {
    const f = publicationFixture(context); let result = f.publish(); assert.equal(result.status, 0, result.stdout + result.stderr)
    const head = f.git('--git-dir=' + f.remote, 'rev-parse', 'main')
    assert.equal(f.git('rev-parse', head + '^'), f.userSha); assert.equal(f.git('--git-dir=' + f.remote, 'rev-parse', 'v1.0.0'), f.tagSha)
    assert.equal(readFileSync('user-work.txt', 'utf8'), 'Keep this newer work.\n'); assert.ok(readFileSync('CHANGELOG.md', 'utf8').includes('### ✨ Features\n- Initial release'))
    result = f.publish(); assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(f.git('--git-dir=' + f.remote, 'rev-parse', 'main'), head)
})

test('rejected publication retries without force or duplicate commits', context => {
    const f = publicationFixture(context); const hook = join(f.remote, 'hooks/pre-receive')
    writeFileSync(hook, '#!/bin/sh\nif test ! -f "$GIT_DIR/first-push-rejected"; then touch "$GIT_DIR/first-push-rejected"; exit 1; fi\n'); chmodSync(hook, 0o700)
    const result = f.publish(); assert.equal(result.status, 0, result.stdout + result.stderr); assert.ok(existsSync(join(f.remote, 'first-push-rejected')))
    const head = f.git('--git-dir=' + f.remote, 'rev-parse', 'main')
    assert.equal(f.git('rev-parse', head + '^'), f.userSha); assert.equal(f.git('--git-dir=' + f.remote, 'rev-parse', 'v1.0.0'), f.tagSha)
})

test('version headings respect the configured prefix for either caller', context => {
    const f = fixture(context, { initial: false }); f.configure({ tag_prefix: 'v' })
    updateChangelog('1.0.0', '### Features\n- Initial release', '2026-10-29')
    assert.ok(readFileSync('CHANGELOG.md', 'utf8').includes('## v1.0.0 - 2026-10-29'))
    assert.equal(updateChangelog('v1.0.0', 'Different notes', '2026-10-29'), false)
})

test('invalid versions, dates and empty notes cannot overwrite the file', context => {
    fixture(context, { initial: false }); writeFileSync('CHANGELOG.md', '# Existing history\n')
    for (const [version, body, date] of [['invalid', 'Some notes', null], ['1.0.0', '# Release-Notes 1.0.0', null],
        ['1.0.0', '# Release-Notes 1.0.0\n\nChanges since `v0.9.0`.\n', null], ['1.0.0', 'Notes', '2026-02-30']]) assert.throws(() => updateChangelog(version, body, date))
    assert.equal(readFileSync('CHANGELOG.md', 'utf8'), '# Existing history\n')
})
