import { jsonResponse } from '../index'
import { runDiscovery } from '../discovery/discovery-engine'

export async function handleDiscoveryRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /discovery/run — run discovery on a project
  if (path === '/discovery/run' && req.method === 'POST') {
    const body = await req.json() as { projectPath: string; agent?: string }
    if (!body.projectPath) {
      return jsonResponse({ error: 'Missing "projectPath"' }, 400)
    }

    try {
      const result = await runDiscovery(body.projectPath, body.agent)
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ error: `Discovery failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
