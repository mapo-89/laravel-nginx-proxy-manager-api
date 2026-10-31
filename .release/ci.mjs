import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './release.mjs'

export function requireGreenCi(settings, branch, sha, execute = execFileSync) {
    const check = settings.branch_workflow?.prepare_ci
    if (!check) return
    const workflows = check.workflows ?? (check.workflow ? [check.workflow] : [])
    if (!Array.isArray(workflows) || !workflows.length || workflows.some(value => typeof value !== 'string' || !/^[\w.-]+\.ya?ml$/.test(value))) {
        throw new Error('Configure the required preparation CI workflow filenames.')
    }
    for (const workflow of workflows) {
        let runs
        const options = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }
        try {
            if (settings.hosting === 'gitea') {
                runs = JSON.parse(execute(process.execPath, [fileURLToPath(import.meta.url), JSON.stringify({ ...check, workflow, branch, sha })], options))
            } else if (settings.hosting === 'github') {
                runs = JSON.parse(execute('gh', [
                    'run', 'list', '--workflow', workflow, '--branch', branch,
                    '--commit', sha, '--event', 'pull_request', '--limit', '100',
                    '--json', 'headSha,headBranch,event,status,conclusion',
                ], options))
            } else throw new Error('Unsupported CI host')
        } catch {
            throw new Error(`Cannot verify ${workflow} CI. Check host configuration and read access (${settings.hosting === 'gitea' ? 'GITEA_TOKEN' : 'gh auth status'}); no version has been prepared.`)
        }
        // APIs list newest runs first; never hide a pending/failed run with an older success.
        const latest = Array.isArray(runs) && runs.find(run => run.headSha === sha && run.headBranch === branch && run.event === 'pull_request')
        if (!['completed', 'success'].includes(latest?.status) || latest?.conclusion !== 'success') {
            throw new Error(`Wait for successful release PR CI (${workflow}) on the exact current commit before preparing the version. Keep the PR in draft until preparation is complete.`)
        }
    }
}

export async function giteaRuns(check, request = fetch, token = process.env.GITEA_TOKEN) {
    const server = new URL(check.server_url)
    if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash) throw new Error('Configure an HTTPS Gitea server URL without credentials.')
    if (!/^[\w.-]+\/[\w.-]+$/.test(check.repository ?? '')) throw new Error('Configure the Gitea owner/repository.')
    if (!token) throw new Error('Configure GITEA_TOKEN with repository Actions read access.')
    const url = new URL(`${server.href.replace(/\/$/, '')}/api/v1/repos/${check.repository}/actions/workflows/${encodeURIComponent(check.workflow)}/runs`)
    url.search = new URLSearchParams({ branch: check.branch, head_sha: check.sha, event: 'pull_request', limit: '100' })
    const response = await request(url, { headers: { Authorization: `token ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Gitea CI query failed (HTTP ${response.status}).`)
    const data = await response.json()
    if (!Array.isArray(data.workflow_runs)) throw new Error('Invalid Gitea workflow response.')
    return data.workflow_runs.map(run => ({ headSha: run.head_sha, headBranch: run.head_branch, event: run.event, status: run.status, conclusion: run.conclusion }))
}

if (isMain(import.meta.url)) {
    try { console.log(JSON.stringify(await giteaRuns(JSON.parse(process.argv[2])))) }
    catch { console.error('Cannot read Gitea CI. Check server configuration and GITEA_TOKEN read access.'); process.exitCode = 1 }
}
