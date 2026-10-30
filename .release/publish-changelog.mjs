import { existsSync } from 'node:fs'
import { config, git, isMain, preparedNotes, tryGit, verifyReleaseMerge, versionTuple } from './release.mjs'
import { updateChangelog } from './changelog.mjs'
import { readFileSync } from 'node:fs'

export function publishChangelog(version, notesFile, branch, tag) {
    if (!version || !notesFile || !branch || !tag) throw new Error('Release version, notes file, branch, and immutable tag are required')
    if (!existsSync(notesFile)) throw new Error('Release notes file does not exist')
    git('diff', '--quiet')
    git('diff', '--cached', '--quiet')
    for (let attempt = 1; attempt <= 3; attempt++) {
        git('fetch', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`, `refs/tags/${tag}:refs/tags/${tag}`)
        git('merge-base', '--is-ancestor', tag, `refs/remotes/origin/${branch}`)
        if (config().branch_workflow) {
            if (branch !== config().branch_workflow.main) throw new Error('Published release verification requires main')
            const number = versionTuple(version).join('.')
            verifyReleaseMerge(tag, number)
            const published = readFileSync(notesFile, 'utf8').trim().replace(/^# Release-Notes [^\n]+\n+/, '').trim()
            if (preparedNotes(tag, number) !== published) throw new Error('Published notes differ from the changelog in the immutable release tag')
            return
        }
        git('switch', '--detach', `refs/remotes/origin/${branch}`)
        updateChangelog(version, readFileSync(notesFile, 'utf8'), null, tag)
        git('add', '--', 'CHANGELOG.md')
        if (tryGit('diff', '--cached', '--quiet').status === 0) return
        git('config', 'user.name', 'release-automation')
        git('config', 'user.email', 'release-automation@users.noreply.github.com')
        git('commit', '-m', `📝 Docs: Update CHANGELOG for ${tag}`)
        const push = tryGit('push', 'origin', `HEAD:refs/heads/${branch}`)
        if (push.status === 0) return
        console.error(push.stderr?.trim() || 'Changelog push failed')
        console.log(`Changelog push failed (attempt ${attempt}/3); checking the latest branch before retrying.`)
    }
    throw new Error('Could not publish the changelog without overwriting the remote branch.')
}

if (isMain(import.meta.url)) {
    try { publishChangelog(...process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
