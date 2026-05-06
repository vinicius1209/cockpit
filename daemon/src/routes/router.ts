import { jsonResponse } from '../http'
import { handleProjectRoutes } from './projects'
import { handleAgentRoutes } from './agents'
import { handleDiscoveryRoutes } from './discovery'
import { handleSchedulerRoutes } from './scheduler'
import { handleSecretsRoutes } from './secrets'
import { handleChatRoutes } from './chat'
import { handleImplementRoutes } from './implement'
import { handleSessionRoutes } from './sessions'
import { handleDataRoutes } from './data'
import { handleTaskRoutes } from './tasks'
import { handleGitRoutes } from './git'
import { handleMetricsRoutes } from './metrics'
import { handleMaintenanceRoutes } from './maintenance'

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname

  // Health check
  if (path === '/health') {
    return jsonResponse({ status: 'ok', version: '0.2.0' })
  }

  // Project routes
  if (path.startsWith('/projects')) {
    return handleProjectRoutes(req, url)
  }

  // Implement routes (before /agents to avoid prefix conflict)
  // Handles /agents/implement (SSE) and /agents/implement/async (fire-and-forget).
  if (path.startsWith('/agents/implement') && req.method === 'POST') {
    return handleImplementRoutes(req, url)
  }

  // Session reconciliation routes
  if (path.startsWith('/agents/sessions')) {
    return handleSessionRoutes(req, url)
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

  // Metrics
  if (path === '/api/metrics') {
    return handleMetricsRoutes(req, url)
  }

  // Maintenance (doctor --fix)
  if (path.startsWith('/maintenance')) {
    return handleMaintenanceRoutes(req, url)
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
