import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { config, git, isMain, planRelease } from './release.mjs'

// This changes only the disposable build checkout, never the release commit/tag.
export function writeBuildMetadata(version, ref) {
    if (!config().branch_workflow) throw new Error('Build metadata requires the release branch workflow')
    if (!version || !ref) throw new Error('An exact release version and merge SHA are required')
    const plan = planRelease('manual', 'patch', version, ref)
    if (git('rev-parse', 'HEAD') !== plan.sha) throw new Error('Check out the exact release merge before writing build metadata')
    const entries = (config().version_files ?? []).filter(entry => entry.keys.includes('release_version'))
    if (!entries.length) throw new Error('No application version files are declared for this build')
    const updates = entries.map(entry => {
        const original = readFileSync(entry.path, 'utf8')
        const data = JSON.parse(original)
        if (data.release_version !== plan.version) throw new Error(`Unexpected release version in ${entry.path}`)
        const fields = { display_version: plan.display_version, image_version: plan.image_version, commit: plan.short_sha, commit_date: plan.commit_date }
        for (const [key, value] of Object.entries(fields)) if (Object.hasOwn(data, key)) data[key] = value
        return { path: entry.path, content: JSON.stringify(data, null, original.match(/\n( +)"/)?.[1].length ?? 4) + '\n' }
    })
    for (const entry of updates) writeFileSync(entry.path, entry.content)
    return plan
}

if (isMain(import.meta.url)) {
    try {
        const { values } = parseArgs({ options: { version: { type: 'string' }, ref: { type: 'string' } } })
        const plan = writeBuildMetadata(values.version, values.ref)
        console.log(`Build metadata: ${plan.image_version} (${plan.sha})`)
    } catch (error) { console.error(error.message); process.exitCode = 1 }
}
