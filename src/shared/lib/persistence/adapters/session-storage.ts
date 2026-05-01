import type { StorageAdapter } from '../types'

export const sessionStorageAdapter: StorageAdapter = {
  getItem: (name) => window.sessionStorage.getItem(name),
  setItem: (name, value) => window.sessionStorage.setItem(name, value),
  removeItem: (name) => window.sessionStorage.removeItem(name),
}
