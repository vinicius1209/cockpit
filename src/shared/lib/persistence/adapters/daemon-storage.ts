import type { StorageAdapter } from '../types'
import { DAEMON_URL } from '@/shared/lib/constants'

// Skip daemon sync in test environment
const IS_TEST = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'

// Track last write timestamp per store to detect stale data
const lastWriteTs: Record<string, number> = {}
// Track last persisted content (sem _ts) per store. Usado para deduplicar
// writes — Zustand persist chama setItem a cada update do state mesmo que
// o partialized output seja estruturalmente idêntico, causando spam de POST.
const lastPersistedContent: Record<string, string> = {}

// Strip _ts from a serialized payload for content comparison
function stripTs(serialized: string): string {
  try {
    const parsed = JSON.parse(serialized)
    if (parsed && typeof parsed === 'object') {
      const { _ts: _drop, ...rest } = parsed
      return JSON.stringify(rest)
    }
  } catch { /* ok */ }
  return serialized
}

export function createDaemonStorageAdapter(storeName: string): StorageAdapter {
  return {
    getItem: (name) => {
      const local = window.localStorage.getItem(name)

      if (IS_TEST) return local // Skip daemon sync in tests

      fetch(`${DAEMON_URL}/api/data/${storeName}`)
        .then((r) => {
          if (!r.ok) return null
          return r.json()
        })
        .then((data) => {
          if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            // Wrap with timestamp for conflict detection
            const daemonPayload = data as { state?: unknown; _ts?: number }
            const daemonTs = daemonPayload._ts || 0
            const localTs = lastWriteTs[name] || 0

            // Only overwrite localStorage if daemon data is newer than our last write
            if (daemonTs > localTs) {
              const serialized = JSON.stringify(data)
              const current = window.localStorage.getItem(name)
              if (serialized !== current) {
                window.localStorage.setItem(name, serialized)
                // Trigger Zustand rehydration
                window.dispatchEvent(new StorageEvent('storage', { key: name, newValue: serialized }))
              }
            }
          }
        })
        .catch(() => {
          // Daemon offline — use localStorage as fallback
        })

      return local
    },

    setItem: (name, value) => {
      if (IS_TEST) {
        window.localStorage.setItem(name, value)
        return
      }

      // Dedup: se o conteudo (sem _ts) eh idêntico ao último persistido,
      // skip o POST. Isto previne dezenas de POSTs durante implementação
      // (cada chunk muda processingCards, partialize cria novo object literal,
      // Zustand persist chama setItem mesmo com conteudo igual).
      const contentHash = stripTs(value)
      if (lastPersistedContent[name] === contentHash) {
        // Atualiza localStorage (com novo _ts) mas pula o daemon
        window.localStorage.setItem(name, value)
        return
      }
      lastPersistedContent[name] = contentHash

      const ts = Date.now()
      lastWriteTs[name] = ts

      let stamped: string
      try {
        const parsed = JSON.parse(value)
        parsed._ts = ts
        stamped = JSON.stringify(parsed)
      } catch {
        stamped = value
      }

      // Save to localStorage immediately (fast)
      window.localStorage.setItem(name, stamped)

      // Save to daemon (persistent).
      //
      // NOTA: Em v0.7+, o daemon suporta optimistic locking via campo
      // `version` no payload. Aqui ainda mandamos sem version → daemon
      // faz force-write (expectedVersion=-1, sem check). Isto significa
      // que se o daemon escrever via atomicMutate (ex: updateCardPrUrl)
      // entre nosso GET e POST, aquela mutation pode ser sobrescrita.
      //
      // Mitigação atual: frontend bate o daemon a cada few ms via
      // Zustand persist, então o gap real é minúsculo. Cenários reais
      // problemáticos: (1) implement em background atualizar pr_url
      // enquanto user edita o card no Web — pr_url é overwritten.
      //
      // Fix completo (v0.8?): rastrear `version` retornada pelo GET
      // (linha 47 já recebe), incluir em POST → daemon trata 409 e
      // frontend re-fetch. Implica refatorar Zustand persist signature
      // ou usar zustand/middleware/persist com merge custom.
      fetch(`${DAEMON_URL}/api/data/${storeName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stamped,
      }).catch(() => {
        // Daemon offline — data saved in localStorage, will sync on next getItem
      })
    },

    removeItem: (name) => {
      window.localStorage.removeItem(name)
      delete lastWriteTs[name]
    },
  }
}
