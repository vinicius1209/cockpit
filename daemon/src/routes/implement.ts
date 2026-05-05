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
        let closed = false

        function safeEnqueue(text: string) {
          if (closed) return
          try { controller.enqueue(encoder.encode(text)) } catch { closed = true }
        }

        function send(event: ImplementEvent) {
          safeEnqueue(`data: ${JSON.stringify(event)}\n\n`)
        }

        // Anti-buffering: flush imediato + heartbeat. SSE comments (`: ...\n\n`)
        // sao ignorados pelo browser mas forcam o flush do socket. Sem isso,
        // Bun.serve pode acumular eventos pequenos por minutos antes de mandar.
        safeEnqueue(': stream-open\n\n')
        const heartbeat = setInterval(() => safeEnqueue(': hb\n\n'), 1500)

        try {
          await runImplementation(body, send)
        } catch (err) {
          send({ phase: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
        } finally {
          clearInterval(heartbeat)
          closed = true
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
