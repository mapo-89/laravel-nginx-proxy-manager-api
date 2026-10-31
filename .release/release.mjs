import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const rules = JSON.parse(readFileSync(new URL('./categories.json', import.meta.url), 'utf8'))
const semver = '(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)'
const stable = new RegExp(`^v?${semver}(?![\\s\\S])`)
const releaseMarker = new RegExp(`^🚀 Release:(?: (major|minor|patch|v?${semver}))?(?![\\s\\S])`)

export const config = () => existsSync('.release/config.json') ? JSON.parse(readFileSync('.release/config.json', 'utf8')) : {}
export const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
export const tryGit = (...args) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
export const isMain = url => Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === url

export function versionTuple(version) {
    if (!stable.test(version)) throw new Error(`Invalid stable SemVer version: ${version}`)
    return version.replace(/^v/, '').split('.').map(BigInt)
}

export function compareVersions(a, b) {
    const first = Array.isArray(a) ? a : versionTuple(a)
    const second = Array.isArray(b) ? b : versionTuple(b)
    for (let i = 0; i < 3; i++) if (first[i] !== second[i]) return first[i] > second[i] ? 1 : -1
    return 0
}

export function stableTags(ref = 'HEAD') {
    const ignored = config().ignore_tags ?? []
    return git('tag', '--merged', ref).split('\n').filter(tag => stable.test(tag) && !ignored.includes(tag))
        .map(tag => [versionTuple(tag), tag]).sort((a, b) => compareVersions(b[0], a[0]) || b[1].localeCompare(a[1]))
}

export const ignoredSubject = subject => rules.ignored_prefixes.some(prefix => subject.startsWith(prefix))
export function validSubject(subject) {
    if (releaseMarker.test(subject) || subject.startsWith('⚙️ Chore: set version to ')) return true
    return rules.sections.some(section => section.prefixes.some(prefix => prefix.codePointAt(0) > 127
        && subject.startsWith(prefix + ' ') && subject.slice(prefix.length).trim().length > 0))
}

export function renderNotes(version, subjects, previous = null, options = {}) {
    versionTuple(version)
    const german = (options.language ?? config().language) === 'de'
    const groups = rules.sections.map(section => ({ ...section, items: [] }))
    groups.push({ name: 'Other Changes', de: 'Weitere Änderungen', icon: '📌', prefixes: [], items: [] })
    for (const subject of subjects) {
        if (!subject.trim() || ignoredSubject(subject)) continue
        const group = groups.find(section => section.prefixes.some(prefix => subject.startsWith(prefix))) ?? groups.at(-1)
        const prefix = group.prefixes.find(value => subject.startsWith(value))
        group.items.push(prefix ? subject.slice(prefix.length).trim() : subject)
    }
    const lines = [`# Release-Notes ${version}`, '']
    if (!previous && !options.omitContext) {
        lines.push(german ? 'Erste Veröffentlichung.' : 'Initial release.', '')
    }
    for (const group of groups) {
        if (group.items.length) lines.push(`### ${group.icon} ${german ? group.de : group.name}`, ...group.items.map(item => '- ' + item), '')
    }
    if (!groups.some(group => group.items.length)) lines.push(german ? 'Keine nutzerrelevanten Änderungen.' : 'No user-facing changes detected in this release.')
    return lines.join('\n') + '\n'
}

export function releaseNotes(version, ref = 'HEAD', subjects = null, revision = null, usePrepared = true) {
    if (config().branch_workflow && usePrepared && subjects === null) {
        const subject = git('log', '-1', '--format=%s', ref)
        const number = versionTuple(version).join('.')
        if (subject === `⚙️ Chore: set version to ${number}` || subject === `🚀 Release: ${number}`) {
            return `# Release-Notes ${version}\n\n${preparedNotes(ref, number)}\n`
        }
    }
    const target = versionTuple(version)
    const previous = stableTags(ref).find(([number]) => compareVersions(number, target) < 0)?.[1] ?? null
    const range = revision || (previous ? `${previous}..${ref}` : ref)
    return renderNotes(version, subjects ?? git('log', '--reverse', '--format=%s', range).split('\n'), previous)
}

export function planRelease(event, bump = 'patch', version = '', ref = 'HEAD', validateMerge = true) {
    const skipped = { should_release: 'false', should_skip: 'true', skip: 'true' }
    if (event === 'push') {
        if (git('log', '-1', '--format=%B', ref).includes('[skip release]')) return skipped
        const marker = git('log', '-1', '--format=%s', ref).match(releaseMarker)
        if (!marker) return skipped
        const requested = marker[1] || 'patch'
        if (['major', 'minor', 'patch'].includes(requested)) { bump = requested; version = '' }
        else version = requested
    }
    if (config().branch_workflow && validateMerge) {
        const marker = git('log', '-1', '--format=%s', ref).match(releaseMarker)
        if (!marker || !marker[1] || ['major', 'minor', 'patch'].includes(marker[1])) throw new Error('Publish an exact-version release merge; prepare a release/X.Y.Z branch first.')
        const mergedVersion = versionTuple(marker[1]).join('.')
        if (version && versionTuple(version).join('.') !== mergedVersion) throw new Error('The requested version differs from the release merge')
        version = mergedVersion
        verifyReleaseMerge(ref, version)
        const target = process.env.GITHUB_REF
        if (target && target !== 'refs/heads/' + config().branch_workflow.main) throw new Error('Publish releases only from main')
    }
    if (!['major', 'minor', 'patch'].includes(bump)) throw new Error('Select patch, minor, or major explicitly; automatic bumps are not supported.')
    const tags = stableTags(ref)
    const current = tags[0]?.[0] ?? versionTuple(config().baseline_version ?? '0.0.0')
    let sha = git('rev-parse', `${ref}^{commit}`)
    let number
    if (version) number = versionTuple(version)
    else if (tags.length && git('rev-parse', `${tags[0][1]}^{commit}`) === sha) number = current
    else if (!tags.length && compareVersions(current, [0n, 0n, 0n]) === 0) number = [1n, 0n, 0n]
    else {
        const [major, minor, patch] = current
        number = { major: [major + 1n, 0n, 0n], minor: [major, minor + 1n, 0n], patch: [major, minor, patch + 1n] }[bump]
    }
    const normalized = number.join('.')
    let tag = (config().tag_prefix ?? 'v') + normalized
    const allTags = git('tag', '--list').split('\n')
    const existing = allTags.find(name => stable.test(name) && compareVersions(name, number) === 0 && !(config().ignore_tags ?? []).includes(name))
    if (existing) {
        const existingSha = git('rev-parse', `${existing}^{commit}`)
        if (existingSha !== sha) {
            const generated = ['⚙️ Chore: set version to ', '🔖 Release: Bump ', '📦 Update: Bump '].some(prefix => git('log', '-1', '--format=%s', existingSha).startsWith(prefix))
            const parents = git('rev-list', '--parents', '-n', '1', existingSha).split(/\s+/).slice(1)
            if (!(config().version_commit && generated && parents.length === 1 && parents[0] === sha)) throw new Error(`Release ${existing} already points to another commit.`)
            sha = existingSha
        }
        tag = existing
    } else if (compareVersions(number, current) <= 0) throw new Error('The requested version must be newer than the previous release.')
    if (allTags.includes(tag) && git('rev-parse', `${tag}^{commit}`) !== sha) throw new Error(`Tag ${tag} already points to another commit.`)
    const previous = tags.find(([value]) => compareVersions(value, number) < 0)?.[1] ?? ''
    const short = git('rev-parse', '--short', sha)
    const date = git('log', '-1', '--date=iso-strict', '--format=%cI', sha)
    return { should_release: 'true', should_skip: 'false', skip: 'false', version: normalized, release_version: normalized,
        tag, sha, release_type: bump, release_range: previous ? `${previous}..${ref}` : ref, previous_tag: previous,
        is_existing_release: String(Boolean(existing)), version_commit_sha: sha, short_sha: short, short_commit_id: short,
        commit_date: date, display_version: `${normalized} (${short})`, image_version: `${normalized}-${short}` }
}

export function preparedNotes(ref, version) {
    const number = versionTuple(version).join('.')
    const document = git('show', `${ref}:CHANGELOG.md`)
    const headers = [...document.matchAll(/^##[ \t]+\[?(v?[0-9]+\.[0-9]+\.[0-9]+)\]?(?=[ \t]|$)[^\n]*(?:\n|$)/gm)]
    const index = headers.findIndex(header => versionTuple(header[1]).join('.') === number)
    if (index < 0) throw new Error('The release changelog must be prepared before merging')
    return document.slice(headers[index].index + headers[index][0].length, headers[index + 1]?.index ?? document.length).trim()
}

export function verifyPreparedRelease(ref, version) {
    const number = versionTuple(version).join('.')
    const branch = config().branch_workflow.release_prefix + number
    if (git('log', '-1', '--format=%s', ref) !== `⚙️ Chore: set version to ${number}` || !git('log', '-1', '--format=%B', ref).split('\n').includes(`Release-Branch: ${branch}`)) throw new Error('Prepare the release branch after its last change')
    if (!preparedNotes(ref, number)) throw new Error('The prepared changelog must not be empty')
    for (const entry of config().version_files ?? []) {
        const data = JSON.parse(git('show', `${ref}:${entry.path}`))
        for (const key of entry.keys) {
            let value = data
            for (const segment of key.split('.')) value = value?.[segment]
            if (value !== number) throw new Error(`Prepare version ${number} in ${entry.path}`)
        }
        if (entry.keys.includes('release_version')) {
            for (const [key, value] of Object.entries(preparedVersionMetadata(number))) {
                if (Object.hasOwn(data, key) && data[key] !== value) throw new Error(`Remove pre-merge build identity from ${entry.path}`)
            }
        }
    }
    for (const entry of config().version_text_files ?? []) {
        const text = git('show', `${ref}:${entry.path}`)
        const matches = [...text.matchAll(new RegExp(entry.pattern, 'gm'))]
        if (matches.length !== 1 || matches[0][0] !== matches[0][1] + number + matches[0][2]) throw new Error(`Prepare version ${number} in ${entry.path}`)
    }
}

export function verifyReleaseMerge(ref, version) {
    const parents = git('rev-list', '--parents', '-n', '1', ref).split(/\s+/).slice(1)
    if (parents.length !== 2) throw new Error('Releases require a --no-ff merge commit on main')
    git('merge-base', '--is-ancestor', parents[0], parents[1])
    git('diff', '--exit-code', '--quiet', ref, parents[1])
    verifyPreparedRelease(parents[1], version)
}

export function preparedVersionMetadata(version) {
    const number = versionTuple(version).join('.')
    return { display_version: number, image_version: number, commit: '', commit_date: '' }
}

export function syncVersion(version) {
    const normalized = versionTuple(version).join('.')
    for (const entry of config().version_files ?? []) {
        const original = readFileSync(entry.path, 'utf8')
        const data = JSON.parse(original)
        for (const key of entry.keys) {
            const segments = key.split('.')
            let target = data
            for (const segment of segments.slice(0, -1)) target = target[segment]
            target[segments.at(-1)] = normalized
        }
        if (entry.keys.includes('release_version')) {
            const sha = git('rev-parse', '--short', 'HEAD')
            const fields = config().branch_workflow ? preparedVersionMetadata(normalized) : { display_version: `${normalized} (${sha})`, image_version: `${normalized}-${sha}`, commit: sha,
                commit_date: git('log', '-1', '--date=iso-strict', '--format=%cI') }
            for (const [key, value] of Object.entries(fields)) if (Object.hasOwn(data, key)) data[key] = value
        }
        writeFileSync(entry.path, JSON.stringify(data, null, original.match(/\n( +)"/)?.[1].length ?? 4) + '\n')
    }
    for (const entry of config().version_text_files ?? []) {
        const original = readFileSync(entry.path, 'utf8')
        const pattern = new RegExp(entry.pattern, 'gm')
        const matches = [...original.matchAll(pattern)]
        if (matches.length !== 1 || matches[0].length !== 3) throw new Error(`Expected one version declaration in ${entry.path}`)
        writeFileSync(entry.path, original.replace(pattern, (_match, before, after) => before + normalized + after))
    }
}

export function checkCommits(base, ref = 'HEAD') {
    const revision = /^0+$/.test(base) ? `${ref}^!` : `${base}..${ref}`
    const invalid = git('log', '--no-merges', '--format=%h %s', revision).split('\n').filter(Boolean)
        .filter(line => !validSubject(line.slice(line.indexOf(' ') + 1)))
    if (invalid.length) throw new Error('Use <emoji> <Type>: <imperative summary> (see .release/README.md):\n' + invalid.join('\n'))
}

function required(values, key) {
    if (!values[key]) throw new Error(`--${key} is required`)
    return values[key]
}

export function main(argv = process.argv.slice(2)) {
    const [command, ...args] = argv
    if (['--help', '-h'].includes(command)) { console.log('Usage: node .release/release.mjs <notes|plan|gate|sync|check-commits> [options]'); return }
    const { values } = parseArgs({ args, options: { version: { type: 'string' }, ref: { type: 'string', default: 'HEAD' },
        event: { type: 'string' }, bump: { type: 'string', default: 'patch' }, range: { type: 'string' },
        base: { type: 'string' }, json: { type: 'boolean' }, 'export-env': { type: 'boolean' }, 'subjects-json': { type: 'boolean' } } })
    if (command === 'notes') {
        const subjects = values['subjects-json'] ? JSON.parse(readFileSync(0, 'utf8')) : null
        process.stdout.write(releaseNotes(required(values, 'version'), values.ref, subjects, values.range))
    } else if (command === 'plan' || command === 'gate') {
        const event = values.event ?? (command === 'gate' ? 'push' : 'manual')
        if (!['push', 'manual'].includes(event)) throw new Error('Invalid release event')
        if (command === 'gate' && process.env.GITHUB_REF && !(config().release_branches ?? ['main']).some(branch => process.env.GITHUB_REF === 'refs/heads/' + branch)) throw new Error('Production releases require a configured release branch.')
        const result = planRelease(event, values.bump, values.version ?? '', values.ref)
        if (values.json) { console.log(JSON.stringify(result)); return }
        const output = Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join('')
        process.stdout.write(output)
        if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
        if (values['export-env'] && process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV,
            Object.entries(result).map(([key, value]) => `${key.toUpperCase()}=${value}\n`).join(''))
    } else if (command === 'sync') syncVersion(required(values, 'version'))
    else if (command === 'check-commits') checkCommits(required(values, 'base'), values.ref)
    else throw new Error('Use notes, plan, gate, sync, or check-commits.')
}

if (isMain(import.meta.url)) {
    try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
