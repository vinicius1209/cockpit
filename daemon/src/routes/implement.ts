import { jsonResponse } from '../http'
import { runImplementation, type ImplementConfig, type ImplementEvent } from '../implement/implementation-runner'
import { validateProjectPath } from '../validation'

export async function handleImplementRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /agents/implement — run implementation with SSE streaming
  if (path === '/agents/implement' && req.method === 'POST') {
    const body = await req.json() as ImplementConfig

    if (!body.spec || !body.projectPath || !body.cardTitle) {
      return jsonResponse({ error: 'Missing required fields: spec, projectPath, cardTitle' }, 400)
    }
    const validPath = validateProjectPath(body.projectPath)
    if (!validPath) {
      return jsonResponse({ error: 'Invalid projectPath' }, 400)
    }
    body.projectPath = validPath

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        function send(event: ImplementEvent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }

        try {
          await runImplementation(body, send)
        } catch (err) {
          send({ phase: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
        } finally {
          controller.close()
        }
      },
    })

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
