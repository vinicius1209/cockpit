import { jsonResponse } from '../http'
import { detectInstalledAgents, executeAgent, executeAgentStreaming } from '../executor/agent-executor'
import { startSpecGenAsync, type SpecGenConfig } from '../spec/spec-runner'
import { validateProjectPath } from '../validation'

export async function handleAgentRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /agents/available — list installed agents
  if (path === '/agents/available' && req.method === 'GET') {
    const agents = await detectInstalledAgents()
    return jsonResponse(agents)
  }

  // POST /agents/spec/async — fire-and-forget spec generation
  if (path === '/agents/spec/async' && req.method === 'POST') {
    const body = await req.json() as Partial<SpecGenConfig>
    if (!body.cardId || !body.workspaceSlug) {
      return jsonResponse({ error: 'cardId + workspaceSlug obrigatórios' }, 400)
    }
    if (body.projectPath) {
      const valid = validateProjectPath(body.projectPath)
      if (!valid) return jsonResponse({ error: 'Invalid projectPath' }, 400)
      body.projectPath = valid
    }
    try {
      const result = await startSpecGenAsync(body as SpecGenConfig)
      return jsonResponse({ sessionId: result.sessionId, status: 'started' })
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'erro' }, 400)
    }
  }

  // POST /agents/execute — run agent (blocking)
  if (path === '/agents/execute' && req.method === 'POST') {
    const body = await req.json() as { agent: string; prompt: string; projectPath?: string; model?: string }
    if (!body.agent || !body.prompt) {
      return jsonResponse({ error: 'Missing "agent" or "prompt"' }, 400)
    }

    const result = await executeAgent(body)
    return jsonResponse(result)
  }

  // POST /agents/stream — run agent (SSE streaming)
  if (path === '/agents/stream' && req.method === 'POST') {
    const body = await req.json() as { agent: string; prompt: string; projectPath?: string; model?: string }
    if (!body.agent || !body.prompt) {
      return jsonResponse({ error: 'Missing "agent" or "prompt"' }, 400)
    }

    const { stream } = executeAgentStreaming(body)

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
