import { jsonResponse } from '../http'
import { runImplementation, type ImplementConfig, type ImplementEvent } from '../implement/implementation-runner'
import { validateProjectPath } from '../validation'
import { peekActiveProjectLock, ProjectLockedError } from '../tasks/project-lock'

function lockErrorBody(err: ProjectLockedError) {
  return {
    error: 'project_locked',
    message: 'Outra implementacao ja esta rodando neste projeto',
    project_path: err.path,
    held_by: {
      session_id: err.heldBy.sessionId,
      card_id: err.heldBy.cardId,
      workspace_slug: err.heldBy.workspaceSlug,
      agent: err.heldBy.agent,
      acquired_at: err.heldBy.acquiredAt,
      age_seconds: err.heldBy.ageSeconds,
    },
    hints: [
      'aguarde a session atual terminar (cockpit watch ' + (err.heldBy.cardId || '<id>') + ')',
      'ou aborte a session via Web UI / cockpit log',
      'modo worktree (isolamento real) chega no F9-B',
    ],
  }
}

export async function handleImplementRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /agents/implement/async — fire-and-forget. Returns { sessionId } as soon
  // as the session row is created in SQLite; runImplementation continues in the
  // background. Clients (notably MCP cockpit_implement_async) follow progress via
  // GET /agents/sessions/<id> or SSE /agents/sessions/<id>/stream.
  if (path === '/agents/implement/async' && req.method === 'POST') {
    const body = await req.json() as ImplementConfig

    if (!body.spec || !body.projectPath || !body.cardTitle) {
      return jsonResponse({ error: 'Missing required fields: spec, projectPath, cardTitle' }, 400)
    }
    if (!body.workspaceSlug || !body.cardId) {
      return jsonResponse({ error: 'workspaceSlug + cardId are required for async mode (session tracking)' }, 400)
    }
    const validPath = validateProjectPath(body.projectPath)
    if (!validPath) {
      return jsonResponse({ error: 'Invalid projectPath' }, 400)
    }
    body.projectPath = validPath

    // F9-A — pre-check do lock. Se outro implement esta rodando no mesmo
    // path, retorna 409 ANTES de criar a session zumbi. UX clara via
    // payload `held_by` rico.
    const existingLock = await peekActiveProjectLock(body.projectPath)
    if (existingLock) {
      return jsonResponse(lockErrorBody(new ProjectLockedError(body.projectPath, existingLock)), 409)
    }

    let resolveSession: (id: string) => void = () => {}
    let rejectSession: (err: Error) => void = () => {}
    const sessionPromise = new Promise<string>((res, rej) => {
      resolveSession = res
      rejectSession = rej
    })

    // Kick off in background. Don't await. Errors are persisted into the
    // session row by the runner itself.
    runImplementation(body, (event: ImplementEvent) => {
      if (event.phase === 'session-started' && event.sessionId) {
        resolveSession(event.sessionId)
      }
    }).catch((err) => {
      // ProjectLockedError pode acontecer numa race entre peek e acquire —
      // surface via reject pra route convertir em 409.
      if (err instanceof ProjectLockedError) {
        rejectSession(err)
        return
      }
      console.error('[implement/async] runImplementation crashed:', err)
    })

    // Wait at most 15s for session to be created (it should take <100ms in practice)
    let sessionId: string | null = null
    try {
      sessionId = await Promise.race([
        sessionPromise,
        new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
      ])
    } catch (err) {
      if (err instanceof ProjectLockedError) {
        return jsonResponse(lockErrorBody(err), 409)
      }
      throw err
    }

    if (!sessionId) {
      return jsonResponse({ error: 'Timed out waiting for session row creation' }, 504)
    }

    return jsonResponse({ sessionId, status: 'started' })
  }

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

    // F9-A — mesma pre-check que o async endpoint. Retorna 409 ANTES de
    // abrir o SSE pra que o cliente CLI/Web receba o erro estruturado em
    // JSON normal (mais facil de parsear que SSE event de erro).
    const existingLock = await peekActiveProjectLock(body.projectPath)
    if (existingLock) {
      return jsonResponse(lockErrorBody(new ProjectLockedError(body.projectPath, existingLock)), 409)
    }

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
