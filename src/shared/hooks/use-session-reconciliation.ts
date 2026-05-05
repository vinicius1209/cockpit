import { useEffect } from 'react'
import { daemonClient } from '@/shared/lib/daemon-client'
import { useCardStore } from '@/entities/card/store'
import { DAEMON_URL } from '@/shared/lib/constants'

// Reconciles in-flight agent sessions from the daemon back into the frontend
// `processingCards` store on app boot, and opens an SSE per session for live
// updates (N3 + N8).
//
// Strategy:
//   1. GET /agents/sessions/running on mount
//   2. For each session, populate processingCards with its chunks so far
//   3. Open EventSource at /agents/sessions/:id/stream
//      - 'snapshot' event arrives first
//      - 'chunk' events with replayed=true → skip (already in chunks)
//      - 'chunk' events with replayed=false → addProcessingChunk
//      - 'done' → completeProcessing
//      - 'error' → errorProcessing
export function useSessionReconciliation() {
  useEffect(() => {
    let cancelled = false
    const sources: EventSource[] = []
    const { setProcessing, addProcessingChunk, completeProcessing, errorProcessing } = useCardStore.getState()

    daemonClient.listRunningSessions()
      .then(({ sessions }) => {
        if (cancelled) return

        for (const s of sessions) {
          // Hydrate state from snapshot
          setProcessing({
            cardId: s.cardId,
            action: s.action,
            status: 'running',
            chunks: s.chunks || [],
            startedAt: s.startedAt,
            sessionId: s.id,
            agent: s.agent,
            model: s.model || undefined,
          })

          // Open live stream
          const es = new EventSource(`${DAEMON_URL}/agents/sessions/${s.id}/stream`)
          sources.push(es)

          es.onmessage = (msg) => {
            try {
              const event = JSON.parse(msg.data)
              if (event.type === 'chunk' && !event.replayed) {
                // Live chunk — append
                addProcessingChunk(s.cardId, event.text as string)
              } else if (event.type === 'done') {
                completeProcessing(s.cardId)
                es.close()
              } else if (event.type === 'error') {
                errorProcessing(s.cardId, (event.error as string) || 'Erro desconhecido')
                es.close()
              }
              // snapshot/replay-done/replayed chunks são ignorados — já temos
              // o state hidratado do listRunningSessions
            } catch {
              // skip malformed
            }
          }

          es.onerror = () => {
            // Connection lost. Don't error the processing — the daemon may still
            // be working. Just close and let the user refresh if they want.
            es.close()
          }
        }

        if (sessions.length > 0) {
          console.log(`[reconciliation] ${sessions.length} sessao(oes) reidratada(s) com stream ao vivo`)
        }
      })
      .catch((err) => {
        if (!cancelled) console.warn('[reconciliation] skip:', err.message)
      })

    return () => {
      cancelled = true
      for (const es of sources) es.close()
    }
  }, [])
}
