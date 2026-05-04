import { analyzeGitFlow, getProfile, switchGhAccount } from './git-flow-profile'

export interface CreatePRConfig {
  projectPath: string
  branch: string
  cardTitle: string
  cardType: string
  spec: string | null
  filesModified: number
  filesCreated: number
  filesDeleted: number
  draft: boolean
}

export interface PRResult {
  url: string
  number: number
  title: string
  draft: boolean
}

const BRANCH_PREFIX_MAP: Record<string, string> = {
  feature: 'feat',
  bugfix: 'fix',
  hotfix: 'hotfix',
  chore: 'chore',
  improvement: 'improve',
  discovery: 'feat',
}

async function runCmd(cmd: string, args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`${cmd} ${args[0]} failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`)
  }
  return stdout.trim()
}

function generatePRTitle(config: CreatePRConfig, convention: 'conventional' | 'freeform'): string {
  if (convention === 'conventional') {
    const prefix = BRANCH_PREFIX_MAP[config.cardType] || 'feat'
    // Clean title: remove [sub-project] prefix if present
    const cleanTitle = config.cardTitle
      .replace(/\[.*?\]\s*/g, '')
      .toLowerCase()
      .slice(0, 72)
    return `${prefix}: ${cleanTitle}`
  }
  return config.cardTitle
}

function generatePRBody(config: CreatePRConfig, templateContent: string | null): string {
  if (templateContent) {
    return fillPRTemplate(templateContent, config)
  }
  return generateDefaultBody(config)
}

function fillPRTemplate(template: string, config: CreatePRConfig): string {
  let body = template

  // Fill description section
  const descriptionBlock = buildDescription(config)
  body = body.replace(
    /<!-- O que foi feito.*?-->/s,
    descriptionBlock,
  )

  // Check the type checkbox
  const typeMap: Record<string, string> = {
    feature: '`feat`',
    bugfix: '`fix`',
    hotfix: '`fix`',
    chore: '`chore`',
    improvement: '`refactor`',
    discovery: '`feat`',
  }
  const matchType = typeMap[config.cardType]
  if (matchType) {
    body = body.replace(`- [ ] ${matchType}`, `- [x] ${matchType}`)
  }

  return body
}

function buildDescription(config: CreatePRConfig): string {
  const parts: string[] = []

  // Summary from spec (first paragraph or first 3 lines)
  if (config.spec) {
    const specLines = config.spec.split('\n').filter((l) => l.trim())
    // Find first content after a heading
    let summary = ''
    for (const line of specLines) {
      if (line.startsWith('#')) continue
      if (line.startsWith('---')) continue
      summary += line + '\n'
      if (summary.split('\n').length > 4) break
    }
    if (summary.trim()) {
      parts.push(summary.trim())
    }
  }

  // File stats
  const stats: string[] = []
  if (config.filesCreated > 0) stats.push(`${config.filesCreated} arquivo(s) criado(s)`)
  if (config.filesModified > 0) stats.push(`${config.filesModified} arquivo(s) modificado(s)`)
  if (config.filesDeleted > 0) stats.push(`${config.filesDeleted} arquivo(s) removido(s)`)
  if (stats.length > 0) {
    parts.push(`\n**Alteracoes:** ${stats.join(', ')}`)
  }

  parts.push('\n_PR criada automaticamente pelo Cockpit._')

  return parts.join('\n')
}

function generateDefaultBody(config: CreatePRConfig): string {
  const parts: string[] = []

  parts.push('## Resumo\n')
  parts.push(buildDescription(config))

  return parts.join('\n')
}

export async function createPR(config: CreatePRConfig): Promise<PRResult> {
  const { projectPath, branch } = config

  // 1. Load or create git flow profile
  let profile = getProfile(projectPath)
  if (!profile) {
    profile = await analyzeGitFlow(projectPath)
  }

  // 2. Check if PR already exists for this branch
  try {
    const existingJson = await runCmd('gh', [
      'pr', 'list', '--head', branch, '--state', 'open',
      '--json', 'number,url,title',
    ], projectPath)

    const existing = JSON.parse(existingJson || '[]') as { number: number; url: string; title: string }[]
    if (existing.length > 0) {
      return {
        url: existing[0].url,
        number: existing[0].number,
        title: existing[0].title,
        draft: false,
      }
    }
  } catch (err) {
    // If gh command itself fails (auth, network), log but continue
    // The PR create will fail too if gh is broken, so this is safe
    console.error(`[pr-creator] Failed to check existing PRs: ${err instanceof Error ? err.message : 'unknown'}`)
  }

  // 3. Ensure correct gh account
  if (profile.ghAccount) {
    await switchGhAccount(profile.ghAccount)
  }

  // 4. Push branch to remote
  await runCmd('git', ['push', '-u', 'origin', branch], projectPath)

  // 5. Generate title and body
  const title = generatePRTitle(config, profile.titleConvention)
  const body = generatePRBody(config, profile.prTemplateContent)

  // 6. Create PR
  const args = [
    'pr', 'create',
    '--title', title,
    '--body', body,
    '--base', profile.baseBranch,
    '--head', branch,
  ]
  if (config.draft) {
    args.push('--draft')
  }

  const output = await runCmd('gh', args, projectPath)

  // Parse PR URL from output (gh pr create prints the URL)
  const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/)
  const prUrl = urlMatch?.[0] || output.trim()

  // Get PR number from URL
  const numberMatch = prUrl.match(/\/pull\/(\d+)/)
  const prNumber = numberMatch ? parseInt(numberMatch[1], 10) : 0

  return {
    url: prUrl,
    number: prNumber,
    title,
    draft: config.draft,
  }
}
