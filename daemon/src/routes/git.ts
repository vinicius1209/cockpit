import { jsonResponse } from '../http'
import { analyzeGitFlow, getProfile, getAllProfiles, listGhAccounts, switchGhAccount } from '../git/git-flow-profile'
import { validateProjectPath, sanitizeGhUser } from '../validation'

// Cache simples (in-memory, TTL 30s) pra GET /git/pr-status — multi cliente
// (Live Agents lanes + card detail) acabam batendo no mesmo PR. gh pr view
// custa ~500-800ms por chamada.
const prStatusCache = new Map<string, { at: number; data: Record<string, unknown> }>()
const PR_CACHE_TTL = 30_000

export async function handleGitRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /git/analyze — analyze git flow for a project and cache profile
  if (path === '/git/analyze' && req.method === 'POST') {
    const body = await req.json() as { projectPath: string }
    const validPath = validateProjectPath(body.projectPath || '')
    if (!validPath) {
      return jsonResponse({ error: 'Invalid or missing projectPath' }, 400)
    }

    try {
      const profile = await analyzeGitFlow(validPath)
      return jsonResponse(profile)
    } catch (err) {
      return jsonResponse({ error: `Analysis failed: ${err instanceof Error ? err.message : 'unknown'}` }, 500)
    }
  }

  // GET /git/profile?path=... — get cached profile
  if (path === '/git/profile' && req.method === 'GET') {
    const validPath = validateProjectPath(url.searchParams.get('path') || '')
    if (!validPath) {
      return jsonResponse({ error: 'Invalid or missing "path" query parameter' }, 400)
    }

    const profile = getProfile(validPath)
    if (!profile) {
      return jsonResponse({ error: 'Profile not found. Run POST /git/analyze first.' }, 404)
    }
    return jsonResponse(profile)
  }

  // GET /git/profiles — list all cached profiles
  if (path === '/git/profiles' && req.method === 'GET') {
    return jsonResponse(getAllProfiles())
  }

  // GET /git/accounts — list gh authenticated accounts
  if (path === '/git/accounts' && req.method === 'GET') {
    const accounts = await listGhAccounts()
    return jsonResponse(accounts)
  }

  // GET /git/pr-status?url=... — pega status atual do PR via gh CLI.
  // Retorna state (OPEN/CLOSED/MERGED), isDraft, mergedAt, closedAt, title.
  // Cache: 30s in-memory pra evitar spam quando ha multiplas lanes/cards.
  if (path === '/git/pr-status' && req.method === 'GET') {
    const prUrl = url.searchParams.get('url') || ''
    const m = prUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (!m) {
      return jsonResponse({ error: 'invalid PR url (esperava https://github.com/<owner>/<repo>/pull/<n>)' }, 400)
    }
    const [, owner, repo, num] = m
    const cached = prStatusCache.get(prUrl)
    if (cached && Date.now() - cached.at < PR_CACHE_TTL) {
      return jsonResponse({ ...cached.data, cached: true })
    }
    try {
      const proc = Bun.spawn([
        'gh', 'pr', 'view', num,
        '--repo', `${owner}/${repo}`,
        '--json', 'state,isDraft,mergedAt,closedAt,title,url,number,author',
      ], { stdout: 'pipe', stderr: 'pipe' })
      const [out, err] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const code = await proc.exited
      if (code !== 0) {
        return jsonResponse({ error: `gh pr view falhou: ${err.trim() || 'exit ' + code}` }, 500)
      }
      const data = JSON.parse(out.trim()) as Record<string, unknown>
      prStatusCache.set(prUrl, { at: Date.now(), data })
      return jsonResponse(data)
    } catch (e) {
      return jsonResponse({ error: `pr-status falhou: ${(e as Error).message}` }, 500)
    }
  }

  // POST /git/switch-account — switch active gh account
  if (path === '/git/switch-account' && req.method === 'POST') {
    const body = await req.json() as { user: string }
    const user = sanitizeGhUser(body.user || '')
    if (!user) {
      return jsonResponse({ error: 'Invalid or missing "user"' }, 400)
    }

    const ok = await switchGhAccount(user)
    if (!ok) {
      return jsonResponse({ error: `Failed to switch to ${body.user}` }, 500)
    }
    return jsonResponse({ switched: true, user: body.user })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
