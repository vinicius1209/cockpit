import { jsonResponse } from '../index'
import { detectInstalledAgents, executeAgent, executeAgentStreaming } from '../executor/agent-executor'

export async function handleAgentRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /agents/available — list installed agents
  if (path === '/agents/available' && req.method === 'GET') {
    const agents = await detectInstalledAgents()
    return jsonResponse(agents)
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
