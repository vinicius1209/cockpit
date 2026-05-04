import { jsonResponse } from '../http'
import { handleProjectRoutes } from './projects'
import { handleAgentRoutes } from './agents'
import { handleDiscoveryRoutes } from './discovery'
import { handleSchedulerRoutes } from './scheduler'
import { handleSecretsRoutes } from './secrets'
import { handleChatRoutes } from './chat'
import { handleImplementRoutes } from './implement'
import { handleDataRoutes } from './data'
import { handleTaskRoutes } from './tasks'
import { handleGitRoutes } from './git'

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

  // Implement route (before /agents to avoid prefix conflict)
  if (path === '/agents/implement' && req.method === 'POST') {
    return handleImplementRoutes(req, url)
  }

  // Agent routes
  if (path.startsWith('/agents')) {
    return handleAgentRoutes(req, url)
  }

  // Discovery routes
  if (path.startsWith('/discovery')) {
    return handleDiscoveryRoutes(req, url)
  }

  // Scheduler routes
  if (path.startsWith('/scheduler')) {
    return handleSchedulerRoutes(req, url)
  }

  // Secrets routes
  if (path.startsWith('/secrets')) {
    return handleSecretsRoutes(req, url)
  }

  // Task workspace routes
  if (path.startsWith('/api/tasks')) {
    return handleTaskRoutes(req, url)
  }

  // Data persistence routes
  if (path.startsWith('/api/data')) {
    return handleDataRoutes(req, url)
  }

  // Git routes
  if (path.startsWith('/git')) {
    return handleGitRoutes(req, url)
  }

  // Chat routes
  if (path.startsWith('/chat')) {
    return handleChatRoutes(req, url)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
