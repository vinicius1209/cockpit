import { jsonResponse } from '../http'
import { scanProject } from '../scanner/project-scanner'
import { bootstrapProject } from '../bootstrap/bootstrapper'
import { validateProjectPath } from '../validation'

export async function handleProjectRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /projects/scan — scan a project
  if (path === '/projects/scan' && req.method === 'POST') {
    const body = await req.json() as { path: string }
    const validPath = validateProjectPath(body.path || '')
    if (!validPath) {
      return jsonResponse({ error: 'Invalid or missing "path"' }, 400)
    }

    try {
      const result = await scanProject(validPath)
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ error: `Scan failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  // POST /projects/bootstrap — auto-generate agent configs
  if (path === '/projects/bootstrap' && req.method === 'POST') {
    const body = await req.json() as { path: string; force?: boolean }
    const validBootstrapPath = validateProjectPath(body.path || '')
    if (!validBootstrapPath) {
      return jsonResponse({ error: 'Invalid or missing "path"' }, 400)
    }

    try {
      const result = await bootstrapProject(validBootstrapPath, body.force)
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ error: `Bootstrap failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
