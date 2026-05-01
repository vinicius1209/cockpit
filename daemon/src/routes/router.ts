import { jsonResponse } from '../index'
import { handleProjectRoutes } from './projects'
import { handleAgentRoutes } from './agents'
import { handleDiscoveryRoutes } from './discovery'

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname

  // Health check
  if (path === '/health') {
    return jsonResponse({ status: 'ok', version: '0.1.0' })
  }

  // Project routes
  if (path.startsWith('/projects')) {
    return handleProjectRoutes(req, url)
  }

  // Agent routes
  if (path.startsWith('/agents')) {
    return handleAgentRoutes(req, url)
  }

  // Discovery routes
  if (path.startsWith('/discovery')) {
    return handleDiscoveryRoutes(req, url)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
