import { useEffect } from 'react'
import { daemonClient } from '@/shared/lib/daemon-client'
import { useCardStore } from '@/entities/card/store'

// Reconciles in-flight agent sessions from the daemon back into the frontend
// `processingCards` store on app boot. Without this, if you closed the browser
// during a spec/implementation, the daemon kept running but the kanban LIVE
// indicator was empty when you reopened.
//
// Strategy:
//   1. GET /agents/sessions/running on mount
//   2. For each session, populate processingCards with its chunks so far
//   3. (TODO future) attach an SSE listener for chunks that arrive after reload
//
// For now we just "freeze" the state at boot — the user can refresh to get the
// latest. This is good enough for the common case (spec gens take 30s-2min).
export function useSessionReconciliation() {
  useEffect(() => {
    let cancelled = false
    const setProcessing = useCardStore.getState().setProcessing

    daemonClient.listRunningSessions()
      .then(({ sessions }) => {
        if (cancelled) return
        for (const s of sessions) {
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
        }
        if (sessions.length > 0) {
          console.log(`[reconciliation] reidratado ${sessions.length} sessao(oes) ativa(s) do daemon`)
        }
      })
      .catch((err) => {
        // Daemon offline ou rota indisponivel — silencioso (LED do sidebar ja avisa)
        if (!cancelled) console.warn('[reconciliation] skip:', err.message)
      })

    return () => { cancelled = true }
  }, [])
}
