import type { StorageAdapter } from '../types'
import { DAEMON_URL } from '@/shared/lib/constants'

export function createDaemonStorageAdapter(storeName: string): StorageAdapter {
  return {
    getItem: (name) => {
      // Sync: return from localStorage (fast, immediate)
      const local = window.localStorage.getItem(name)

      // Async: sync from daemon in background (source of truth)
      fetch(`${DAEMON_URL}/api/data/${storeName}`)
        .then((r) => {
          if (!r.ok) return null
          return r.json()
        })
        .then((data) => {
          if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            const serialized = JSON.stringify(data)
            const current = window.localStorage.getItem(name)
            // Only update if daemon has different data
            if (serialized !== current) {
              window.localStorage.setItem(name, serialized)
            }
          }
        })
        .catch(() => {
          // Daemon offline — use localStorage as fallback
        })

      return local
    },

    setItem: (name, value) => {
      // Save to localStorage immediately (fast)
      window.localStorage.setItem(name, value)

      // Save to daemon (persistent, fire-and-forget)
      fetch(`${DAEMON_URL}/api/data/${storeName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: value,
      }).catch(() => {
        // Daemon offline — data saved in localStorage, will sync later
      })
    },

    removeItem: (name) => {
      window.localStorage.removeItem(name)
    },
  }
}
