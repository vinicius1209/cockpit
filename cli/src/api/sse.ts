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
