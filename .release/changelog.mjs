import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { config, git, isMain, tryGit, versionTuple } from './release.mjs'

export function unreleasedSection(document) {
    const match = /^##[ \t]+(?:\[?Unreleased\]?|\[?Unveröffentlicht\]?)[ \t]*\r?$/mi.exec(document)
    if (!match) return null
    const following = /^##[ \t]+/m.exec(document.slice(match.index + match[0].length))
    const end = following ? match.index + match[0].length + following.index : document.length
    return { start: match.index, end, text: document.slice(match.index, end) }
}

export function updateChangelog(version, notes, releaseDate = null, releaseRef = null) {
    const number = versionTuple(version).join('.')
    const original = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8')
        : config().language === 'de' ? '# Änderungsprotokoll\n\n' : '# Changelog\n\n'
    for (const header of original.matchAll(/^##[ \t]+\[?(v?[0-9]+\.[0-9]+\.[0-9]+)\]?(?=[ \t]|$)/gm)) {
        if (versionTuple(header[1]).join('.') === number) return false
    }
    releaseDate ||= releaseRef ? git('log', '-1', '--format=%cs', releaseRef) : new Date().toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || !Number.isFinite(Date.parse(releaseDate)) || new Date(releaseDate).toISOString().slice(0, 10) !== releaseDate) throw new Error('Invalid release date')
    let body = notes.trim()
    if (body.startsWith('# Release-Notes ')) body = body.includes('\n') ? body.slice(body.indexOf('\n') + 1).trimStart() : ''
    body = body.replace(/^(?:Changes since|Änderungen seit)[ \t]+`[^`\r\n]+`\.[ \t]*(?:\r?\n|$)/gm, '').trim()
    if (!body) throw new Error('Cannot update CHANGELOG.md with empty release notes.')
    const entryVersion = config().tag_prefix == null ? version : config().tag_prefix + number
    const entry = `## ${entryVersion} - ${releaseDate}\n\n${body}\n\n`
    let document = original
    let pending = unreleasedSection(document)
    if (pending && releaseRef) {
        const snapshot = tryGit('show', `${releaseRef}:CHANGELOG.md`)
        const releasedPending = snapshot.status === 0 ? unreleasedSection(snapshot.stdout) : null
        if (releasedPending?.text === pending.text) {
            document = document.slice(0, pending.start) + document.slice(pending.end)
            pending = unreleasedSection(document)
        }
    }
    if (pending && !pending.text.replace(/^[^\n]*(?:\n|$)/, '').trim()) {
        document = document.slice(0, pending.start) + document.slice(pending.end)
        pending = unreleasedSection(document)
    }
    const position = pending?.end ?? /^##[ \t]+/m.exec(document)?.index ?? document.length
    let prefix = document.slice(0, position)
    if (prefix && !prefix.endsWith('\n\n')) prefix = prefix.replace(/\n*$/, '') + '\n\n'
    writeFileSync('CHANGELOG.md', prefix + entry + document.slice(position))
    return true
}

export function main(argv = process.argv.slice(2)) {
    if (argv.includes('--help') || argv.includes('-h')) { console.log('Usage: node .release/changelog.mjs --version X.Y.Z --notes-file FILE [--release-ref REF] [--date YYYY-MM-DD]'); return }
    const { values } = parseArgs({ args: argv, options: { version: { type: 'string' }, 'notes-file': { type: 'string' },
        date: { type: 'string' }, 'release-ref': { type: 'string' } } })
    if (!values.version || !values['notes-file']) throw new Error('--version and --notes-file are required')
    const changed = updateChangelog(values.version, readFileSync(values['notes-file'], 'utf8'), values.date, values['release-ref'])
    console.log(changed ? 'CHANGELOG.md updated.' : 'Version already documented; keeping CHANGELOG.md unchanged.')
}

if (isMain(import.meta.url)) {
    try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
