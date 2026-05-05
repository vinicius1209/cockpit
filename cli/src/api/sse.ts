// Minimal SSE reader using fetch streaming. Bun has native fetch with
// stream body support — no eventsource lib needed.

import { rawFetch } from './client'

export interface SseEvent {
  type: string
  [key: string]: unknown
}

export type SseHandler = (event: SseEvent) => void

interface SseOpts {
  signal?: AbortSignal
  onError?: (err: Error) => void
}

// F9-A — erro estruturado quando daemon retorna 409 (project_locked).
// CLI e MCP detectam via instanceof e renderizam UX rica em vez de "HTTP 409".
export interface LockHeldBy {
  session_id: string
  card_id?: string
  workspace_slug?: string
  agent?: string
  acquired_at: string
  age_seconds?: number
}

export class ProjectLockedError extends Error {
  readonly projectPath: string
  readonly heldBy: LockHeldBy
  readonly hints: string[]
  constructor(projectPath: string, heldBy: LockHeldBy, hints: string[] = []) {
    super(`project locked: ${projectPath}`)
    this.name = 'ProjectLockedError'
    this.projectPath = projectPath
    this.heldBy = heldBy
    this.hints = hints
  }
}

// GET endpoint with SSE response. Parses `data: {json}\n\n` blocks.
// Comments (`: heartbeat\n\n`) are silently skipped.
export async function getSSE(path: string, onEvent: SseHandler, opts: SseOpts = {}): Promise<void> {
  const res = await rawFetch(path, {
    headers: { Accept: 'text/event-stream' },
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`SSE failed: HTTP ${res.status}`)
  }
  await consumeSSE(res, onEvent, opts)
}

// POST + SSE — para /agents/implement, /chat/run, etc
export async function postSSE(
  path: string,
  body: unknown,
  onEvent: SseHandler,
  opts: SseOpts = {},
): Promise<void> {
  const res = await rawFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    // F9-A — 409 vem como JSON normal (nao SSE) com payload estruturado.
    if (res.status === 409) {
      const data = await res.json().catch(() => null) as {
        error?: string
        project_path?: string
        held_by?: LockHeldBy
        hints?: string[]
      } | null
      if (data?.error === 'project_locked' && data.held_by && data.project_path) {
        throw new ProjectLockedError(data.project_path, data.held_by, data.hints || [])
      }
    }
    const errText = await res.text().catch(() => '')
    throw new Error(`SSE failed: HTTP ${res.status} ${errText.slice(0, 200)}`)
  }
  await consumeSSE(res, onEvent, opts)
}

async function consumeSSE(res: Response, onEvent: SseHandler, opts: SseOpts): Promise<void> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data) continue
          try {
            onEvent(JSON.parse(data) as SseEvent)
          } catch {
            // skip malformed
          }
        }
      }
    }
  } catch (err) {
    if (opts.signal?.aborted) return // silent abort
    opts.onError?.(err as Error)
    throw err
  }
}
