import { createJSONStorage } from 'zustand/middleware'
import type { StorageAdapter } from './types'
import { localStorageAdapter } from './adapters/local-storage'

export function createStorageAdapter(adapter?: StorageAdapter) {
  const storage = adapter ?? localStorageAdapter
  return createJSONStorage(() => ({
    getItem: (name: string) => storage.getItem(name),
    setItem: (name: string, value: string) => storage.setItem(name, value),
    removeItem: (name: string) => storage.removeItem(name),
  }))
}
