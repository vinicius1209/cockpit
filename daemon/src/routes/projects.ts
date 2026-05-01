import { jsonResponse } from '../index'
import { scanProject } from '../scanner/project-scanner'
import { bootstrapProject } from '../bootstrap/bootstrapper'

export async function handleProjectRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /projects/scan — scan a project
  if (path === '/projects/scan' && req.method === 'POST') {
    const body = await req.json() as { path: string }
    if (!body.path) {
      return jsonResponse({ error: 'Missing "path" field' }, 400)
    }

    try {
      const result = await scanProject(body.path)
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ error: `Scan failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  // POST /projects/bootstrap — auto-generate agent configs
  if (path === '/projects/bootstrap' && req.method === 'POST') {
    const body = await req.json() as { path: string; force?: boolean }
    if (!body.path) {
      return jsonResponse({ error: 'Missing "path" field' }, 400)
    }

    try {
      const result = await bootstrapProject(body.path, body.force)
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ error: `Bootstrap failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
