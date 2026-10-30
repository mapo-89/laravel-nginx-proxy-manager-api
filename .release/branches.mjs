import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { config, git, isMain, planRelease, releaseNotes, syncVersion, stableTags, tryGit, verifyPreparedRelease, versionTuple } from './release.mjs'
import { updateChangelog } from './changelog.mjs'

function workflow() {
    const value = config().branch_workflow
    if (!value) throw new Error('No release branch workflow configured')
    return value
}

function clean() {
    if (git('status', '--porcelain')) throw new Error('A clean worktree and index are required; commit or resolve existing work first.')
}

function branchVersion(branch) {
    const prefix = workflow().release_prefix
    if (!branch.startsWith(prefix)) throw new Error('Expected a release/X.Y.Z branch')
    return versionTuple(branch.slice(prefix.length)).join('.')
}

export function startRelease(version = '', bump = 'patch') {
    clean()
    const { main, release_prefix: prefix } = workflow()
    if (git('branch', '--show-current') !== main) throw new Error(`Start the release from ${main}; fetch and fast-forward it first.`)
    if (!version) {
        if (!['patch', 'minor', 'major'].includes(bump)) throw new Error('Select patch, minor, or major')
        const current = stableTags(main)[0]?.[0] ?? versionTuple(config().baseline_version ?? '0.0.0')
        const [major, minor, patch] = current
        version = current.every(part => part === 0n) ? '1.0.0'
            : { patch: [major, minor, patch + 1n], minor: [major, minor + 1n, 0n], major: [major + 1n, 0n, 0n] }[bump].join('.')
    }
    const number = versionTuple(version).join('.')
    const plan = planRelease('manual', 'patch', number, main, false)
    if (plan.is_existing_release === 'true') throw new Error('This version is already tagged')
    git('switch', '-c', prefix + number)
    return prefix + number
}

export function prepareRelease(notesFile = null) {
    clean()
    const branch = git('branch', '--show-current')
    const number = branchVersion(branch)
    const { main } = workflow()
    git('merge-base', '--is-ancestor', main, 'HEAD')
    const plan = planRelease('manual', 'patch', number, 'HEAD', false)
    if (plan.is_existing_release === 'true') throw new Error('Released versions are immutable')
    if (git('rev-parse', main) === git('rev-parse', 'HEAD')) throw new Error('Integrate and commit the release changes first.')
    const settings = config()
    if (!notesFile && git('log', '-1', '--format=%s') === `⚙️ Chore: set version to ${number}`) {
        verifyPreparedRelease('HEAD', number)
        return number
    }
    if (settings.prepare_command) execFileSync(settings.prepare_command[0], [...settings.prepare_command.slice(1), number], { stdio: 'inherit' })
    syncVersion(number)
    const notes = notesFile ? readFileSync(notesFile, 'utf8') : releaseNotes(number, 'HEAD', null, null, false)
    const hadChangelog = existsSync('CHANGELOG.md')
    const original = hadChangelog ? readFileSync('CHANGELOG.md', 'utf8') : ''
    // Only the untagged version of this release branch may be refreshed.
    const header = new RegExp(`^##[ \\t]+\\[?v?${number.replaceAll('.', '\\.')}\\]?(?=[ \\t]|$)[^\\n]*(?:\\n|$)`, 'm').exec(original)
    if (header) {
        const after = header.index + header[0].length
        const next = /^##[ \t]+/m.exec(original.slice(after))
        writeFileSync('CHANGELOG.md', original.slice(0, header.index) + original.slice(next ? after + next.index : original.length))
    }
    updateChangelog(number, notes, null, 'HEAD')
    const paths = [...new Set(['CHANGELOG.md', ...(settings.version_files ?? []).map(entry => entry.path), ...(settings.version_text_files ?? []).map(entry => entry.path), ...(settings.prepare_paths ?? [])])]
    git('add', '--', ...paths)
    if (tryGit('diff', '--cached', '--quiet').status !== 0) {
        git('commit', '-m', `⚙️ Chore: set version to ${number}`, '-m', `Release-Branch: ${branch}`)
    }
    verifyPreparedRelease('HEAD', number)
    return number
}

export function mergeRelease(version) {
    clean()
    const { main, release_prefix: prefix } = workflow()
    if (git('branch', '--show-current') !== main) throw new Error(`Switch to ${main} before merging a release`)
    const number = versionTuple(version).join('.')
    const branch = prefix + number
    verifyPreparedRelease(branch, number)
    git('merge-base', '--is-ancestor', main, branch)
    git('merge', '--no-ff', '-m', `🚀 Release: ${number}`, '-m', `Release-Branch: ${branch}`, branch)
    return git('rev-parse', 'HEAD')
}

export function checkPullRequest(base, head, ref, baseRef = null) {
    const { main } = workflow()
    if (base !== main) return
    if (!baseRef) throw new Error('The current main commit must be supplied explicitly with --base-ref')
    const currentMain = git('rev-parse', `${baseRef}^{commit}`)
    if (tryGit('merge-base', '--is-ancestor', currentMain, ref).status !== 0) {
        throw new Error('The release branch must include current main; update it, prepare again and rerun CI.')
    }
    verifyPreparedRelease(ref, branchVersion(head))
}

export function main(argv = process.argv.slice(2)) {
    const [command, ...args] = argv
    const { values } = parseArgs({ args, options: { version: { type: 'string' }, 'notes-file': { type: 'string' }, bump: { type: 'string', default: 'patch' }, base: { type: 'string' }, 'base-ref': { type: 'string' }, head: { type: 'string' }, ref: { type: 'string', default: 'HEAD' } } })
    if (command === 'start') console.log(startRelease(values.version, values.bump))
    else if (command === 'prepare') console.log(prepareRelease(values['notes-file']))
    else if (command === 'merge') throw new Error('Merge releases only through a reviewed pull request; local main merges are disabled.')
    else if (command === 'check-pr') checkPullRequest(values.base, values.head, values.ref, values['base-ref'])
    else throw new Error('Usage: node .release/branches.mjs <start [--version X.Y.Z|--bump patch|minor|major]|prepare [--notes-file FILE]|check-pr --base BRANCH --head BRANCH --ref SHA --base-ref BASE_SHA>')
}

if (isMain(import.meta.url)) {
    try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
