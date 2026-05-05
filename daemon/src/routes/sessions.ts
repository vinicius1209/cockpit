import { jsonResponse } from '../http'
import { listRunningSessions, getAgentSession, getLatestAgentSession, type SessionAction } from '../tasks/session-manager'
import { subscribe as subscribeSession } from '../tasks/session-broker'

// /agents/sessions — read + stream endpoints for session reconciliation (N3/N8).
//
//  GET  /agents/sessions/running                  → all sessions still in flight
//  GET  /agents/sessions/:id                       → single session by id
//  GET  /agents/sessions/:wsSlug/:cardId/latest    → latest session for card (?action=spec)
//  GET  /agents/sessions/:id/stream                → SSE: replay chunks already
//      stored + live forwarding of new chunks/done/error events. Used by frontend
//      after reload to keep a "real" live view.
export async function handleSessionRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  if (path === '/agents/sessions/running' && req.method === 'GET') {
    const sessions = await listRunningSessions()
    return jsonResponse({ sessions })
  }

  // /agents/sessions/<wsSlug>/<cardId>/latest
  const latestMatch = path.match(/^\/agents\/sessions\/([^/]+)\/([^/]+)\/latest$/)
  if (latestMatch && req.method === 'GET') {
    const [, wsSlug, cardId] = latestMatch
    const action = url.searchParams.get('action') as SessionAction | null
    const session = await getLatestAgentSession(wsSlug, cardId, action || undefined)
    return jsonResponse({ session })
  }

  // /agents/sessions/<id>/stream — SSE
  const streamMatch = path.match(/^\/agents\/sessions\/([^/]+)\/stream$/)
  if (streamMatch && req.method === 'GET') {
    const [, id] = streamMatch
    const session = await getAgentSession(id)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)

    const encoder = new TextEncoder()
    let unsubscribe: (() => void) | null = null
    let closed = false
    // Track replayed chunks count — live publishes that match indices
    // already replayed are skipped to avoid duplication when client opens
    // the stream while session is still running.
    const replayedCount = session.chunks.length

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    const stream = new ReadableStream({
      async start(controller) {
        function safeEnqueueRaw(text: string) {
          if (closed) return
          try { controller.enqueue(encoder.encode(text)) } catch { closed = true }
        }
        function safeEnqueue(payload: Record<string, unknown>) {
          safeEnqueueRaw(`data: ${JSON.stringify(payload)}\n\n`)
        }

        // Anti-buffering + retry directive: SSE 'retry: 60000' tells the browser
        // to wait 60s before auto-reconnecting if the connection drops. Sem
        // isso, o browser tenta reconectar a cada ~3s gerando dezenas de GET.
        safeEnqueueRaw('retry: 60000\n: stream-open\n\n')

        // Heartbeat a cada 15s mantem socket vivo + forca flush
        heartbeatTimer = setInterval(() => safeEnqueueRaw(': hb\n\n'), 15_000)

        // Snapshot evento — informa cliente do estado atual
        safeEnqueue({
          type: 'snapshot',
          session: {
            id: session.id,
            cardId: session.cardId,
            action: session.action,
            agent: session.agent,
            model: session.model,
            phase: session.phase,
            startedAt: session.startedAt,
            chunkCount: session.chunks.length,
          },
        })

        // Replay — manda chunks ja persistidos (cliente reconcilia state)
        for (const chunk of session.chunks) {
          safeEnqueue({ type: 'chunk', text: chunk, replayed: true })
        }
        safeEnqueue({ type: 'replay-done', replayedCount })

        // Se sessao ja terminou, manda terminal event e fecha
        if (session.phase === 'done' || session.phase === 'error') {
          safeEnqueue({
            type: session.phase === 'error' ? 'error' : 'done',
            error: session.error,
            exitCode: session.exitCode,
          })
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          controller.close()
          return
        }

        // Live: subscribe ao broker pra receber chunks novos
        unsubscribe = subscribeSession(id, (event) => {
          if (closed) return
          if (event.type === 'chunk') {
            safeEnqueue({ type: 'chunk', text: event.text, replayed: false })
          } else if (event.type === 'done') {
            safeEnqueue({ type: 'done', exitCode: event.exitCode })
            closed = true
            if (heartbeatTimer) clearInterval(heartbeatTimer)
            try { controller.close() } catch { /* ignore */ }
          } else if (event.type === 'error') {
            safeEnqueue({ type: 'error', error: event.error })
            closed = true
            if (heartbeatTimer) clearInterval(heartbeatTimer)
            try { controller.close() } catch { /* ignore */ }
          }
        })
      },
      cancel() {
        closed = true
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        unsubscribe?.()
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

  // /agents/sessions/<id>
  const idMatch = path.match(/^\/agents\/sessions\/([^/]+)$/)
  if (idMatch && req.method === 'GET') {
    const [, id] = idMatch
    const session = await getAgentSession(id)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)
    return jsonResponse({ session })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
