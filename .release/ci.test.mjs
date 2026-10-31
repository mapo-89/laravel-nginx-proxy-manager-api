import assert from 'node:assert/strict'
import test from 'node:test'
import { giteaRuns, requireGreenCi } from './ci.mjs'

const sha = 'a'.repeat(40)
const branch = 'release/1.1.0'
const success = { headSha: sha, headBranch: branch, event: 'pull_request', status: 'completed', conclusion: 'success' }
const settings = { hosting: 'github', branch_workflow: { prepare_ci: { workflows: ['ci.yml', 'release-policy.yml'] } } }

test('preparation requires all configured workflows and the newest exact-commit PR run', () => {
    const commands = []
    requireGreenCi(settings, branch, sha, (command, args) => { commands.push([command, args]); return JSON.stringify([success]) })
    assert.equal(commands.length, 2)
    assert.ok(commands.every(([command, args]) => command === 'gh' && args.includes(sha) && args.includes(branch) && args.includes('pull_request')))
    assert.ok(commands[1][1].includes('release-policy.yml'))
    for (const latest of [{ ...success, conclusion: 'failure' }, { ...success, conclusion: 'cancelled' }, { ...success, conclusion: 'skipped' }, { ...success, status: 'in_progress', conclusion: '' }, { ...success, headSha: 'b'.repeat(40) }, { ...success, headBranch: 'feature/other' }, { ...success, event: 'push' }]) {
        const runs = latest.headSha !== sha || latest.headBranch !== branch || latest.event !== 'pull_request' ? [latest] : [latest, success]
        assert.throws(() => requireGreenCi(settings, branch, sha, () => JSON.stringify(runs)), /Wait for successful/)
    }
    assert.throws(() => requireGreenCi(settings, branch, sha, (_command, args) => JSON.stringify(args.includes('ci.yml') ? [success] : [])), /release-policy.yml/)
})

test('CI lookup failures and malformed configuration cannot prepare a release or expose response bodies', () => {
    assert.throws(() => requireGreenCi(settings, branch, sha, () => { throw new Error('private response') }), error => !error.message.includes('private response'))
    assert.throws(() => requireGreenCi({ ...settings, branch_workflow: { prepare_ci: { workflows: [] } } }, branch, sha), /Configure/)
    assert.throws(() => requireGreenCi(settings, branch, sha, () => '{invalid'), /Cannot verify/)
    assert.throws(() => requireGreenCi(settings, branch, sha, () => '{}'), /Wait for successful/)
    requireGreenCi({}, branch, sha, () => { throw new Error('Unconfigured repositories do not query CI') })
})

test('Gitea preparation uses the adapter and requires every workflow', () => {
    const gitea = { ...settings, hosting: 'gitea' }
    const calls = []
    requireGreenCi(gitea, branch, sha, (command, args) => {
        calls.push([command, JSON.parse(args[1])])
        return JSON.stringify([success])
    })
    assert.equal(calls.length, 2)
    assert.ok(calls.every(([command, input]) => command === process.execPath && input.sha === sha && input.branch === branch))
    assert.equal(calls[1][1].workflow, 'release-policy.yml')
    assert.throws(() => requireGreenCi(gitea, branch, sha, () => '[]'), /Wait for successful/)
})

test('Gitea queries filter SHA, branch and event, normalize runs and keep credentials in headers', async () => {
    const input = { server_url: 'https://git.example.test', repository: 'owner/repo', workflow: 'ci.yml', sha, branch }
    const runs = await giteaRuns(input, async (url, options) => {
        assert.equal(url.pathname, '/api/v1/repos/owner/repo/actions/workflows/ci.yml/runs')
        assert.equal(url.searchParams.get('head_sha'), sha)
        assert.equal(url.searchParams.get('branch'), branch)
        assert.equal(url.searchParams.get('event'), 'pull_request')
        assert.equal(options.headers.Authorization, 'token test-only-token')
        assert.equal(options.redirect, 'error')
        assert.ok(!url.href.includes('test-only-token'))
        return { ok: true, json: async () => ({ workflow_runs: [{ head_sha: sha, head_branch: branch, event: 'pull_request', status: 'completed', conclusion: 'success' }] }) }
    }, 'test-only-token')
    assert.deepEqual(runs, [success])
    await assert.rejects(giteaRuns(input, async () => ({ ok: false, status: 403 }), 'test-only-token'), /HTTP 403/)
    await assert.rejects(giteaRuns(input, async () => ({ ok: true, json: async () => ({}) }), 'test-only-token'), /Invalid Gitea/)
    await assert.rejects(giteaRuns(input, undefined, ''), /GITEA_TOKEN/)
    await assert.rejects(giteaRuns({ ...input, server_url: 'http://git.example.test' }, undefined, 'test-only-token'), /HTTPS/)
})
