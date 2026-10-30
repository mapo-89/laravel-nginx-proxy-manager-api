import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fixture } from './fixture.mjs'
import { checkPullRequest, mergeRelease, prepareRelease, startRelease } from './branches.mjs'
import { planRelease, preparedNotes, verifyPreparedRelease } from './release.mjs'

const script = fileURLToPath(new URL('./branches.mjs', import.meta.url))
const publisher = fileURLToPath(new URL('./publish-changelog.mjs', import.meta.url))

function setup(context) {
    const f = fixture(context)
    f.configure({ tag_prefix: 'v', branch_workflow: { main: 'main', release_prefix: 'release/' }, version_files: [{ path: 'version.json', keys: ['version'] }] })
    writeFileSync('version.json', '{"version":"1.0.0"}\n')
    f.git('add', '.release/config.json', 'version.json'); f.commit('🔧 Chore: Configure release branches'); f.git('tag', 'v1.0.0')
    return f
}

function feature(f, name = 'first') {
    f.git('switch', '-c', 'feature/' + name, 'main')
    writeFileSync(name + '.txt', name); f.git('add', name + '.txt'); f.commit('✨ Feature: Add ' + name)
    f.git('switch', 'main')
}

function ready(f) {
    feature(f); startRelease('1.1.0')
    f.git('merge', '--squash', 'feature/first'); f.commit('✨ Feature: Add first')
    prepareRelease()
}

test('squashed features belong to a non-fast-forward release merge and its immutable tag', context => {
    const f = setup(context); const before = f.git('rev-parse', 'main')
    ready(f)
    assert.equal(JSON.parse(readFileSync('version.json', 'utf8')).version, '1.1.0')
    assert.ok(preparedNotes('HEAD', '1.1.0').includes('Add first'))
    const release = f.git('rev-parse', 'HEAD'); f.git('switch', 'main')
    const sha = mergeRelease('1.1.0')
    assert.equal(f.git('rev-parse', sha + '^1'), before)
    assert.equal(f.git('rev-parse', sha + '^2'), release)
    assert.equal(planRelease('push').sha, sha)
    assert.equal(planRelease('manual').version, '1.1.0')
    f.git('tag', 'v1.1.0'); assert.equal(planRelease('push').sha, sha)
    assert.throws(() => planRelease('manual', 'patch', '1.2.0'))
    assert.ok(!f.git('log', '--first-parent', '--format=%s', 'main').includes('Add first'))
})

test('prepare is idempotent and refreshes untagged notes after a late fix', context => {
    const f = setup(context); ready(f); const prepared = f.git('rev-parse', 'HEAD')
    prepareRelease(); assert.equal(f.git('rev-parse', 'HEAD'), prepared)
    f.commit('🐛 Fix: Correct a late issue')
    assert.throws(() => verifyPreparedRelease('HEAD', '1.1.0'))
    prepareRelease(); const notes = preparedNotes('HEAD', '1.1.0')
    assert.ok(notes.includes('Correct a late issue'))
    assert.equal(readFileSync('CHANGELOG.md', 'utf8').match(/^## v1\.1\.0/gm).length, 1)
})

test('refuses dirty worktrees, existing versions and release branches without changes', context => {
    const f = setup(context)
    writeFileSync('unrelated.txt', 'keep'); assert.throws(() => startRelease('1.1.0'))
    f.git('add', 'unrelated.txt'); f.commit('📝 Docs: Keep unrelated work')
    assert.throws(() => startRelease('1.0.0'))
    startRelease('1.1.0'); assert.throws(() => prepareRelease())
})

test('direct release commits, squash-to-main and divergent main cannot publish', context => {
    const f = setup(context)
    f.commit('🚀 Release: 1.1.0'); assert.throws(() => planRelease('push'))
    ready(f); f.git('switch', 'main'); f.commit('🐛 Fix: Main advanced')
    assert.throws(() => mergeRelease('1.1.0'))
    f.git('merge', '--squash', 'release/1.1.0'); f.commit('🚀 Release: 1.1.0')
    assert.throws(() => planRelease('push'))
})

test('main pull requests require a prepared release branch; feature PRs to release remain allowed', context => {
    const f = setup(context); ready(f)
    let result = f.cli(script, ['check-pr', '--base', 'main', '--head', 'feature/first', '--base-ref', 'main'])
    assert.equal(result.status, 1)
    result = f.cli(script, ['check-pr', '--base', 'main', '--head', 'release/1.1.0', '--base-ref', 'main'])
    assert.equal(result.status, 0, result.stderr)
    result = f.cli(script, ['check-pr', '--base', 'release/1.1.0', '--head', 'feature/first'])
    assert.equal(result.status, 0, result.stderr)
})

test('published changelog verification keeps main unchanged and rejects modified release notes', context => {
    const f = setup(context); ready(f); f.git('switch', 'main'); mergeRelease('1.1.0'); f.git('tag', 'v1.1.0')
    const remote = f.directory + '/remote.git'; f.git('init', '--bare', remote); f.git('remote', 'add', 'origin', remote)
    f.git('push', 'origin', 'main', 'v1.1.0'); const before = f.git('rev-parse', 'HEAD')
    const notes = f.directory + '/notes.md'; writeFileSync(notes, '# Release-Notes 1.1.0\n\n' + preparedNotes('v1.1.0', '1.1.0') + '\n')
    let result = f.cli(publisher, ['1.1.0', notes, 'main', 'v1.1.0'])
    assert.equal(result.status, 0, result.stderr); assert.equal(f.git('rev-parse', 'HEAD'), before)
    writeFileSync(notes, 'Unexpected published notes')
    result = f.cli(publisher, ['1.1.0', notes, 'main', 'v1.1.0']); assert.equal(result.status, 1)
    assert.equal(f.git('rev-parse', 'HEAD'), before)
})


test('a bump request starts the next release even when main is already tagged', context => {
    const f = setup(context)
    assert.equal(startRelease('', 'minor'), 'release/1.1.0')
    f.git('switch', 'main')
    assert.equal(startRelease(), 'release/1.0.1')
})

test('reviewed translated notes are kept as the single publication source', context => {
    const f = setup(context); feature(f); startRelease('1.1.0')
    f.git('merge', '--squash', 'feature/first'); f.commit('✨ Feature: Add first')
    const file = f.directory + '/.git/reviewed.md'; writeFileSync(file, '### ✨ Neue Funktionen\n- Erstes Feature hinzugefügt.\n')
    // Keep input notes outside the worktree to enforce a clean release preparation.
    prepareRelease(file)
    const expected = preparedNotes('HEAD', '1.1.0')
    assert.ok(expected.includes('hinzugefügt'))
    f.git('switch', 'main'); mergeRelease('1.1.0')
    assert.equal(planRelease('push').version, '1.1.0')
})


test('project text versions are synchronized and validated without changing old changelog entries', context => {
    const f = setup(context)
    f.configure({ branch_workflow: { main: 'main', release_prefix: 'release/' }, version_text_files: [{ path: 'version.txt', pattern: '(VERSION=)[0-9.]+(;)' }] })
    writeFileSync('version.txt', 'VERSION=1.0.0;\n')
    writeFileSync('CHANGELOG.md', '# Changelog\n\n## v1.0.0\n\n- Keep historical notes\n')
    f.git('add', '.'); f.commit('🔧 Chore: Configure text version')
    ready(f)
    assert.equal(readFileSync('version.txt', 'utf8'), 'VERSION=1.1.0;\n')
    assert.ok(readFileSync('CHANGELOG.md', 'utf8').endsWith('- Keep historical notes\n'))
    writeFileSync('version.txt', 'VERSION=0.0.0;\n'); f.git('add', 'version.txt')
    f.git('commit', '--amend', '--no-edit')
    assert.throws(() => verifyPreparedRelease('HEAD', '1.1.0'))
})

test('PR checks reject a release missing the fetched main tip before it is merged', context => {
    const f = setup(context); ready(f)
    const release = f.git('rev-parse', 'HEAD')
    const oldMain = f.git('rev-parse', 'main')
    f.git('switch', 'main'); f.commit('📝 Docs: Main advanced')
    const currentMain = f.git('rev-parse', 'HEAD')
    // A detached CI checkout may still have a stale local main branch.
    f.git('switch', '--detach', release)
    f.git('update-ref', 'refs/heads/main', oldMain)
    assert.throws(() => checkPullRequest('main', 'release/1.1.0', release, currentMain), /current main/)
    let result = f.cli(script, ['check-pr', '--base', 'main', '--head', 'release/1.1.0', '--ref', release, '--base-ref', currentMain])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /current main/)
    f.git('merge', '--no-ff', currentMain, '-m', '🔧 Chore: Integrate updated main')
    const integrated = f.git('rev-parse', 'HEAD')
    f.git('switch', 'release/1.1.0'); f.git('merge', '--ff-only', integrated)
    prepareRelease()
    result = f.cli(script, ['check-pr', '--base', 'main', '--head', 'release/1.1.0', '--ref', 'HEAD', '--base-ref', currentMain])
    assert.equal(result.status, 0, result.stderr)
    result = f.cli(script, ['check-pr', '--base', 'main', '--head', 'release/1.1.0', '--ref', 'HEAD'])
    assert.equal(result.status, 1, 'CI must supply an explicit base commit')
})

test('prepared versions are stable and build metadata identifies the exact release merge', async context => {
    const f = setup(context)
    f.configure({ branch_workflow: { main: 'main', release_prefix: 'release/' }, version_files: [{ path: 'version.json', keys: ['release_version'] }] })
    writeFileSync('version.json', JSON.stringify({ release_version: '1.0.0', display_version: '1.0.0-old', image_version: '1.0.0-old', commit: 'old', commit_date: 'old' }))
    f.git('add', '.'); f.commit('🔧 Chore: Configure build metadata')
    ready(f)
    assert.deepEqual(JSON.parse(readFileSync('version.json', 'utf8')), {
        release_version: '1.1.0', display_version: '1.1.0', image_version: '1.1.0', commit: '', commit_date: '',
    })
    const { writeBuildMetadata } = await import('./build-metadata.mjs')
    f.git('switch', 'main'); const merge = mergeRelease('1.1.0'); const plan = planRelease('push')
    const tracked = f.git('show', merge + ':version.json')
    const original = readFileSync('version.json', 'utf8')
    assert.throws(() => writeBuildMetadata('1.2.0', merge))
    assert.throws(() => writeBuildMetadata('1.1.0', merge + '^2'))
    assert.equal(readFileSync('version.json', 'utf8'), original)
    writeBuildMetadata('1.1.0', merge)
    assert.deepEqual(JSON.parse(readFileSync('version.json', 'utf8')), {
        release_version: plan.version, display_version: plan.display_version, image_version: plan.image_version,
        commit: plan.short_sha, commit_date: plan.commit_date,
    })
    assert.equal(f.git('rev-parse', 'HEAD'), merge)
    assert.equal(f.git('show', merge + ':version.json'), tracked)
    assert.equal(f.git('tag', '--list'), 'v1.0.0')
    const result = f.cli(fileURLToPath(new URL('./build-metadata.mjs', import.meta.url)), ['--version', '1.1.0', '--ref', merge])
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.includes(plan.image_version))
})

test('direct release commits and squashed features can be mixed without squashing direct work', context => {
    const f = setup(context); feature(f)
    startRelease('1.1.0')
    writeFileSync('direct.txt', 'direct implementation\n'); f.git('add', 'direct.txt'); f.commit('✨ Feature: Add direct implementation')
    const implementation = f.git('rev-parse', 'HEAD')
    writeFileSync('direct.txt', 'direct implementation with fix\n'); f.git('add', 'direct.txt'); f.commit('🐛 Fix: Correct direct implementation')
    const fix = f.git('rev-parse', 'HEAD')
    f.git('merge', '--squash', 'feature/first'); f.commit('✨ Feature: Add first')
    prepareRelease()
    const notes = preparedNotes('HEAD', '1.1.0')
    for (const summary of ['Add direct implementation', 'Correct direct implementation', 'Add first']) assert.ok(notes.includes(summary))
    f.git('switch', 'main'); const merge = mergeRelease('1.1.0')
    assert.equal(planRelease('push').sha, merge)
    for (const commit of [implementation, fix]) assert.equal(f.git('merge-base', '--is-ancestor', commit, merge), '')
    assert.equal(f.git('show', merge + ':direct.txt'), 'direct implementation with fix')
    assert.equal(f.git('show', merge + ':first.txt'), 'first')
    const releaseCommits = f.git('log', '--format=%s', merge + '^1..' + merge + '^2')
    assert.ok(releaseCommits.includes('✨ Feature: Add direct implementation'))
    assert.ok(releaseCommits.includes('🐛 Fix: Correct direct implementation'))
})

test('local main merge command is disabled in favor of a reviewed PR', context => {
    const f = setup(context); ready(f); f.git('switch', 'main')
    const before = f.git('rev-parse', 'HEAD')
    const result = f.cli(script, ['merge', '--version', '1.1.0'])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /pull request/)
    assert.equal(f.git('rev-parse', 'HEAD'), before)
})

test('cleanup removes only the published merged release branch and preserves its tag', async context => {
    const { cleanupRelease } = await import('./cleanup.mjs')
    const f = setup(context); ready(f); const releaseTip = f.git('rev-parse', 'HEAD')
    f.git('switch', 'main'); const merge = mergeRelease('1.1.0'); f.git('tag', 'v1.1.0')
    const remote = f.directory + '/remote.git'; f.git('init', '--bare', remote); f.git('remote', 'add', 'origin', remote)
    f.git('push', 'origin', 'main', 'release/1.1.0', 'v1.1.0')
    const published = { tag_name: 'v1.1.0', draft: false, prerelease: false, published_at: '2026-10-30T00:00:00Z', body: '# Release-Notes v1.1.0\n\n' + preparedNotes('v1.1.0', '1.1.0') }
    assert.throws(() => cleanupRelease('1.1.0', merge, { ...published, draft: true }, []))
    assert.throws(() => cleanupRelease('1.1.0', merge, { ...published, body: 'Changed notes' }, []), /changelog/)
    assert.throws(() => cleanupRelease('1.1.0', merge, published, [{ number: 42 }]))
    f.git('update-ref', 'refs/heads/release/1.1.0', merge)
    f.git('push', 'origin', 'release/1.1.0')
    assert.throws(() => cleanupRelease('1.1.0', merge, published, []), /additional work/)
    f.git('update-ref', 'refs/heads/release/1.1.0', releaseTip)
    f.git('push', '--force-with-lease=refs/heads/release/1.1.0:' + merge, 'origin', 'release/1.1.0')
    cleanupRelease('1.1.0', merge, published, [])
    assert.equal(f.git('ls-remote', '--heads', 'origin', 'refs/heads/release/1.1.0'), '')
    assert.equal(f.git('rev-parse', 'v1.1.0^{commit}'), merge)
    assert.equal(f.git('rev-parse', 'main'), merge)
    assert.ok(cleanupRelease('1.1.0', merge, published, []).includes('removed'))
})

test('fixtures isolate CI environment from direct planner calls and restore it afterwards', () => {
    const inherited = process.env.GITHUB_REF
    let cleanup
    try {
        process.env.GITHUB_REF = 'refs/heads/release/9.9.9'
        fixture({ after(callback) { cleanup = callback } })
        assert.equal(process.env.GITHUB_REF, undefined)
        cleanup(); cleanup = null
        assert.equal(process.env.GITHUB_REF, 'refs/heads/release/9.9.9')
    } finally {
        cleanup?.()
        if (inherited === undefined) delete process.env.GITHUB_REF
        else process.env.GITHUB_REF = inherited
    }
})
