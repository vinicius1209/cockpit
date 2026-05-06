import { useEffect } from 'react'
import { daemonClient } from '@/shared/lib/daemon-client'
import { useCardStore } from '@/entities/card/store'
import { DAEMON_URL } from '@/shared/lib/constants'

// Reconciles in-flight agent sessions from the daemon back into the frontend
// `processingCards` store on app boot, and opens an SSE per session for live
// updates (N3 + N8).
//
// I1 fix — antes:
//   activeSources Map module-level NUNCA era limpado. Sessions que sumiam do
//   daemon (manual delete, restart, prune) deixavam EventSource auto-retrying
//   pra sempre. Daemon em apps abertos por horas acumulava 50+ ESes orfas.
//
// Agora:
//   - Dedup via Map module-level continua (StrictMode dev safety)
//   - Reconcile periodico a cada 30s: lista running sessions, fecha ESes
//     cujo session_id sumiu da lista (revoked: daemon restart, delete manual,
//     session terminou off-line e não emitiu done)
//   - Cleanup do useEffect fecha tudo no unmount (componente raiz desmontando
//     = app quitting; perfeito momento pra liberar)
const subscribedSessions = new Set<string>()
const activeSources = new Map<string, EventSource>()
const RECONCILE_INTERVAL_MS = 30_000

function closeSession(sessionId: string): void {
  const es = activeSources.get(sessionId)
  if (es) es.close()
  activeSources.delete(sessionId)
  subscribedSessions.delete(sessionId)
}

export function useSessionReconciliation() {
  useEffect(() => {
    let cancelled = false
    const { setProcessing, addProcessingChunk, completeProcessing, errorProcessing } = useCardStore.getState()

    const reconcile = async () => {
      try {
        const { sessions } = await daemonClient.listRunningSessions()
        if (cancelled) return

        const liveIds = new Set(sessions.map((s) => s.id))

        // Fecha ESes cujas sessions sumiram do daemon (revogacao automatica)
        const ourIds = Array.from(activeSources.keys())
        for (const id of ourIds) {
          if (!liveIds.has(id)) {
            closeSession(id)
          }
        }

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

          if (subscribedSessions.has(s.id)) continue
          subscribedSessions.add(s.id)

          const es = new EventSource(`${DAEMON_URL}/agents/sessions/${s.id}/stream`)
          activeSources.set(s.id, es)

          es.onmessage = (msg) => {
            try {
              const event = JSON.parse(msg.data)
              if (event.type === 'chunk' && !event.replayed) {
                addProcessingChunk(s.cardId, event.text as string)
              } else if (event.type === 'done') {
                completeProcessing(s.cardId)
                closeSession(s.id)
              } else if (event.type === 'error') {
                errorProcessing(s.cardId, (event.error as string) || 'Erro desconhecido')
                closeSession(s.id)
              }
            } catch {
              // skip malformed
            }
          }

          // EventSource auto-retries em fail. Fechamos imediato pra evitar
          // loop de reconnect spam — o reconcile periodico vai re-abrir
          // se a session ainda estiver viva.
          es.onerror = () => closeSession(s.id)
        }
      } catch (err) {
        if (!cancelled) console.warn('[reconciliation] skip:', (err as Error).message)
      }
    }

    void reconcile()
    const intervalId = setInterval(reconcile, RECONCILE_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      // I1 fix: fecha TODAS as ESes no unmount. Em prod, o hook so monta uma
      // vez no app root, entao unmount = app quitting (rare). Em StrictMode
      // dev unmount/remount imediato, vamos abrir tudo de novo no remount —
      // safe, traffic temporario aceitavel.
      for (const id of Array.from(activeSources.keys())) closeSession(id)
    }
  }, [])
}
