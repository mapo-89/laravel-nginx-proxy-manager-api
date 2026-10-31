import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function fixture(context, options = {}) {
    const previous = process.cwd()
    const inherited = new Map(['GITHUB_REF', 'GITHUB_OUTPUT', 'GITHUB_ENV'].map(key => [key, process.env[key]]))
    for (const key of inherited.keys()) delete process.env[key]
    const directory = mkdtempSync(join(tmpdir(), 'release-tools-test-'))
    process.chdir(directory)
    context.after(() => {
        process.chdir(previous)
        rmSync(directory, { recursive: true, force: true })
        for (const [key, value] of inherited) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    })
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    git('init', '-q', '--initial-branch=main')
    git('config', 'user.name', 'Release tests')
    git('config', 'user.email', 'release-tests@example.test')
    git('config', 'commit.gpgsign', 'false')
    git('config', 'core.hooksPath', '/dev/null')
    const commit = message => git('commit', '-q', '--allow-empty', '-m', message)
    const configure = value => { mkdirSync('.release', { recursive: true }); writeFileSync('.release/config.json', JSON.stringify(value)) }
    if (options.initial !== false) { configure({}); commit('✨ Feature: Initial decoder') }
    const cli = (script, args, env = {}) => {
        const environment = { ...process.env, ...env }
        for (const key of ['GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_REF']) if (!Object.hasOwn(env, key)) delete environment[key]
        return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: environment })
    }
    return { git, commit, configure, cli, directory }
}
