import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { config, git, isMain, preparedNotes, tryGit, verifyReleaseMerge, versionTuple } from './release.mjs'

export function cleanupRelease(version, sha, published, openPullRequests) {
    const settings = config()
    if (!settings.branch_workflow) throw new Error('A release branch workflow is required')
    const number = versionTuple(version).join('.')
    const tag = (settings.tag_prefix ?? 'v') + number
    if (published?.tag_name !== tag || published.draft !== false || published.prerelease !== false || !published.published_at) throw new Error('A successful published stable release must be verified first')
    if (!Array.isArray(openPullRequests) || openPullRequests.length) throw new Error('Resolve or retarget remaining open release PRs before cleanup')
    if (!/^[a-f0-9]{40,64}$/.test(sha ?? '') || git('rev-parse', `${tag}^{commit}`) !== sha) throw new Error('The immutable release tag must identify the expected merge SHA')
    verifyReleaseMerge(tag, number)
    const notes = String(published.body ?? '').trim().replace(/^# Release-Notes [^\n]+\n+/, '').trim()
    if (notes !== preparedNotes(tag, number)) throw new Error('Published notes differ from the tagged changelog; keeping the branch')
    const { main, release_prefix: prefix } = settings.branch_workflow
    const branch = prefix + number
    if (branch === main || !prefix.startsWith('release/')) throw new Error('Refusing to remove a non-release branch')
    const expectedTip = git('rev-parse', `${sha}^2`)
    git('fetch', '--no-tags', 'origin', `refs/heads/${main}:refs/remotes/origin/${main}`)
    git('merge-base', '--is-ancestor', sha, `refs/remotes/origin/${main}`)
    const remoteTip = git('ls-remote', '--heads', 'origin', `refs/heads/${branch}`).split(/\s+/)[0]
    if (remoteTip && remoteTip !== expectedTip) throw new Error('Release branch contains additional work; keeping it')
    if (remoteTip) {
        // Compare-and-delete: refuse if another push advances the branch after inspection.
        git('push', `--force-with-lease=refs/heads/${branch}:${expectedTip}`, 'origin', `:refs/heads/${branch}`)
    }
    const local = tryGit('rev-parse', '--verify', `refs/heads/${branch}`)
    if (local.status === 0) {
        if (local.stdout.trim() !== expectedTip || git('branch', '--show-current') === branch) return `Remote cleanup complete; local ${branch} retained for existing work or active checkout.`
        git('branch', '-d', branch)
    }
    return `Released branch ${branch} removed; immutable tag ${tag} retained.`
}

if (isMain(import.meta.url)) {
    try {
        const { values } = parseArgs({ options: { version: { type: 'string' }, sha: { type: 'string' }, 'release-file': { type: 'string' }, 'open-prs-file': { type: 'string' } } })
        console.log(cleanupRelease(values.version, values.sha, JSON.parse(readFileSync(values['release-file'], 'utf8')), JSON.parse(readFileSync(values['open-prs-file'], 'utf8'))))
    } catch (error) { console.error(error.message); process.exitCode = 1 }
}
