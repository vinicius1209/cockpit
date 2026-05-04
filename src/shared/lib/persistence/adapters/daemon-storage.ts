import type { StorageAdapter } from '../types'
import { DAEMON_URL } from '@/shared/lib/constants'

// Skip daemon sync in test environment
const IS_TEST = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'

// Track last write timestamp per store to detect stale data
const lastWriteTs: Record<string, number> = {}

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

      // Save to daemon (persistent)
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
