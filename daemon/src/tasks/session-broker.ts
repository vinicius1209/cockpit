// In-memory pub/sub for live session events. Used by /agents/sessions/:id/stream
// to push chunks/finish events to connected SSE clients in real time.
//
// Lifecycle:
// 1. /chat/run cria session → publish('start', sessionId)
// 2. Cada appendChunk → publish('chunk', sessionId, text)
// 3. finishAgentSession → publish('done'|'error', sessionId, ...)
// 4. Subscribers (SSE clients) recebem eventos pendentes
// 5. Quando último subscriber sai, broker libera o slot da memoria

export type SessionEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; exitCode: number | null }
  | { type: 'error'; error: string }

type Subscriber = (event: SessionEvent) => void

interface SessionChannel {
  subscribers: Set<Subscriber>
  // Buffer de events que já aconteceram (drainado no replay).
  // Quando session termina, mantemos por 30s para subscribers que conectarem
  // tarde ainda receberem o terminal event.
  finished: SessionEvent | null
  finishedAt: number | null
}

const channels = new Map<string, SessionChannel>()
const FINISHED_TTL_MS = 30_000

function ensureChannel(sessionId: string): SessionChannel {
  let ch = channels.get(sessionId)
  if (!ch) {
    ch = { subscribers: new Set(), finished: null, finishedAt: null }
    channels.set(sessionId, ch)
  }
  return ch
}

export function publish(sessionId: string, event: SessionEvent): void {
  const ch = ensureChannel(sessionId)
  if (event.type === 'done' || event.type === 'error') {
    ch.finished = event
    ch.finishedAt = Date.now()
  }
  for (const sub of ch.subscribers) {
    try {
      sub(event)
    } catch {
      // Subscriber threw — ignore, will be cleaned on next subscribe call
    }
  }
}

export function subscribe(sessionId: string, sub: Subscriber): () => void {
  const ch = ensureChannel(sessionId)
  ch.subscribers.add(sub)

  // If already finished within TTL, deliver terminal event immediately
  if (ch.finished) {
    try { sub(ch.finished) } catch { /* skip */ }
  }

  return () => {
    ch.subscribers.delete(sub)
    // Clean up channel if no subscribers AND finished
    if (ch.subscribers.size === 0 && ch.finishedAt) {
      // Schedule cleanup
      setTimeout(() => {
        const cur = channels.get(sessionId)
        if (cur && cur.subscribers.size === 0 && cur.finishedAt && Date.now() - cur.finishedAt > FINISHED_TTL_MS) {
          channels.delete(sessionId)
        }
      }, FINISHED_TTL_MS)
    }
  }
}

export function isActive(sessionId: string): boolean {
  return channels.has(sessionId) && !channels.get(sessionId)?.finished
}
