import { useEffect } from 'react'
import { daemonClient } from '@/shared/lib/daemon-client'
import { useCardStore } from '@/entities/card/store'
import { DAEMON_URL } from '@/shared/lib/constants'

// Reconciles in-flight agent sessions from the daemon back into the frontend
// `processingCards` store on app boot, and opens an SSE per session for live
// updates (N3 + N8).
//
// Module-level dedup: keeps track of session IDs we've already opened streams
// for, so React StrictMode (which runs effects twice in dev) and re-mounts of
// the App component don't double-subscribe.
const subscribedSessions = new Set<string>()
const activeSources = new Map<string, EventSource>()

export function useSessionReconciliation() {
  useEffect(() => {
    let cancelled = false
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

          // Dedup: if we already have a stream for this session, skip
          if (subscribedSessions.has(s.id)) continue
          subscribedSessions.add(s.id)

          const es = new EventSource(`${DAEMON_URL}/agents/sessions/${s.id}/stream`)
          activeSources.set(s.id, es)

          const cleanup = () => {
            es.close()
            activeSources.delete(s.id)
            subscribedSessions.delete(s.id)
          }

          es.onmessage = (msg) => {
            try {
              const event = JSON.parse(msg.data)
              if (event.type === 'chunk' && !event.replayed) {
                addProcessingChunk(s.cardId, event.text as string)
              } else if (event.type === 'done') {
                completeProcessing(s.cardId)
                cleanup()
              } else if (event.type === 'error') {
                errorProcessing(s.cardId, (event.error as string) || 'Erro desconhecido')
                cleanup()
              }
            } catch {
              // skip malformed
            }
          }

          // EventSource auto-retries on connection failure. Em caso de erro,
          // fechamos imediatamente para evitar loop de reconexao spam.
          es.onerror = () => cleanup()
        }

        if (sessions.length > 0) {
          console.log(`[reconciliation] ${sessions.length} sessao(oes) ativa(s); ${activeSources.size} stream(s) abertos`)
        }
      })
      .catch((err) => {
        if (!cancelled) console.warn('[reconciliation] skip:', err.message)
      })

    return () => { cancelled = true }
    // NOTE: nao fechamos sources aqui no cleanup do effect porque eles vivem
    // no module scope — fechar derrubaria streams legitimos quando StrictMode
    // re-monta o componente. Eles fecham sozinhos em done/error/errorEvent.
  }, [])
}
