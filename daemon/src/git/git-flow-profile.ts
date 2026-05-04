import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DaemonFileStore } from '../persistence/file-store'

export interface GitFlowProfile {
  projectPath: string
  repoOwner: string
  repoName: string
  remoteUrl: string
  baseBranch: string
  ghAccount: string
  titleConvention: 'conventional' | 'freeform'
  hasPrTemplate: boolean
  prTemplatePath: string | null
  prTemplateContent: string | null
  analyzedAt: string
}

export interface GhAccount {
  user: string
  active: boolean
  host: string
}

const profileStore = new DaemonFileStore<Record<string, GitFlowProfile>>('git-profiles.json', {})

export async function initGitProfiles(): Promise<void> {
  await profileStore.init()
}

export function getProfile(projectPath: string): GitFlowProfile | null {
  return profileStore.get()[projectPath] || null
}

export function getAllProfiles(): Record<string, GitFlowProfile> {
  return profileStore.get()
}

async function runCmd(cmd: string, args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const output = await new Response(proc.stdout).text()
  await proc.exited
  return output.trim()
}

function parseRemoteUrl(url: string): { owner: string; repo: string } | null {
  // SSH: git@github.com:owner/repo.git or git@github-alias:owner/repo.git
  const sshMatch = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }

  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }

  return null
}

export async function listGhAccounts(): Promise<GhAccount[]> {
  try {
    const output = await runCmd('gh', ['auth', 'status'], '/')
      .catch(async () => {
        // gh auth status writes to stderr
        const proc = Bun.spawn(['gh', 'auth', 'status'], { stdout: 'pipe', stderr: 'pipe' })
        const stderr = await new Response(proc.stderr).text()
        await proc.exited
        return stderr
      })

    const accounts: GhAccount[] = []
    const lines = output.split('\n')

    let currentHost = 'github.com'
    for (const line of lines) {
      const hostMatch = line.match(/^(\S+)/)
      if (hostMatch && !line.includes('✓') && !line.includes('-')) {
        currentHost = hostMatch[1]
      }

      const accountMatch = line.match(/Logged in to (\S+) account (\S+)/)
      if (accountMatch) {
        const isActive = line.includes('Active account: true') || output.split(accountMatch[2])[1]?.includes('Active account: true')
        accounts.push({ user: accountMatch[2], active: false, host: accountMatch[1] })
      }
    }

    // Parse active status more reliably
    const sections = output.split('✓ Logged in to')
    for (const section of sections) {
      const userMatch = section.match(/account (\S+)/)
      const activeMatch = section.includes('Active account: true')
      if (userMatch) {
        const existing = accounts.find((a) => a.user === userMatch[1])
        if (existing) existing.active = activeMatch
        else accounts.push({ user: userMatch[1], active: activeMatch, host: 'github.com' })
      }
    }

    return accounts
  } catch {
    return []
  }
}

export async function switchGhAccount(user: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['gh', 'auth', 'switch', '--user', user], { stdout: 'pipe', stderr: 'pipe' })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}

export async function analyzeGitFlow(projectPath: string): Promise<GitFlowProfile> {
  // 1. Remote URL + parse owner/repo
  const remoteUrl = await runCmd('git', ['remote', 'get-url', 'origin'], projectPath)
  const parsed = parseRemoteUrl(remoteUrl)
  const repoOwner = parsed?.owner || 'unknown'
  const repoName = parsed?.repo || 'unknown'

  // 2. Detect base branch from recent PRs
  let baseBranch = 'main'
  try {
    const prJson = await runCmd('gh', ['pr', 'list', '--limit', '10', '--state', 'merged', '--json', 'baseRefName'], projectPath)
    const prs = JSON.parse(prJson || '[]') as { baseRefName: string }[]
    if (prs.length > 0) {
      const counts: Record<string, number> = {}
      for (const pr of prs) {
        counts[pr.baseRefName] = (counts[pr.baseRefName] || 0) + 1
      }
      baseBranch = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'main'
    }
  } catch {
    // Fallback: check if develop branch exists
    try {
      await runCmd('git', ['rev-parse', '--verify', 'origin/develop'], projectPath)
      baseBranch = 'develop'
    } catch {
      baseBranch = 'main'
    }
  }

  // 3. Active gh account
  let ghAccount = ''
  const accounts = await listGhAccounts()
  const active = accounts.find((a) => a.active)
  ghAccount = active?.user || accounts[0]?.user || ''

  // 4. Title convention from recent PRs
  let titleConvention: 'conventional' | 'freeform' = 'freeform'
  try {
    const titlesJson = await runCmd('gh', ['pr', 'list', '--limit', '10', '--state', 'merged', '--json', 'title'], projectPath)
    const titles = (JSON.parse(titlesJson || '[]') as { title: string }[]).map((p) => p.title)
    const conventionalCount = titles.filter((t) => /^(feat|fix|chore|refactor|test|docs|ci|perf|style)\b/.test(t)).length
    if (conventionalCount > titles.length / 2) {
      titleConvention = 'conventional'
    }
  } catch { /* keep freeform */ }

  // 5. PR template
  let hasPrTemplate = false
  let prTemplatePath: string | null = null
  let prTemplateContent: string | null = null

  const templatePaths = [
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/PULL_REQUEST_TEMPLATE/default.md',
    '.github/pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
  ]

  for (const tmplPath of templatePaths) {
    try {
      const fullPath = join(projectPath, tmplPath)
      const s = await stat(fullPath)
      if (s.isFile()) {
        hasPrTemplate = true
        prTemplatePath = tmplPath
        prTemplateContent = await readFile(fullPath, 'utf-8')
        break
      }
    } catch { /* not found */ }
  }

  const profile: GitFlowProfile = {
    projectPath,
    repoOwner,
    repoName,
    remoteUrl,
    baseBranch,
    ghAccount,
    titleConvention,
    hasPrTemplate,
    prTemplatePath,
    prTemplateContent,
    analyzedAt: new Date().toISOString(),
  }

  // Save to cache
  const all = profileStore.get()
  all[projectPath] = profile
  await profileStore.set(all)

  console.log(`[git] Profile analyzed for ${repoOwner}/${repoName}: base=${baseBranch}, account=${ghAccount}, template=${hasPrTemplate}`)

  return profile
}
