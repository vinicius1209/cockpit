import { jsonResponse } from '../index'
import { analyzeGitFlow, getProfile, getAllProfiles, listGhAccounts, switchGhAccount } from '../git/git-flow-profile'
import { validateProjectPath, sanitizeGhUser } from '../validation'

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
