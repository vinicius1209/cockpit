import { getDB } from './db'

const VALID_STORES = ['cards', 'workspaces', 'agents', 'docs', 'projects']

export function getDataStore(name: string): { get: () => unknown; set: (value: unknown) => void } | undefined {
  if (!VALID_STORES.includes(name)) return undefined

  return {
    get: () => {
      const row = getDB().query('SELECT data FROM kv_stores WHERE store_name = ?').get(name) as { data: string } | null
      if (!row) return {}
      try { return JSON.parse(row.data) } catch { return {} }
    },
    set: (value: unknown) => {
      getDB().query(
        'INSERT OR REPLACE INTO kv_stores (store_name, data, updated_at) VALUES (?, ?, ?)',
      ).run(name, JSON.stringify(value), new Date().toISOString())
    },
  }
}

export function listDataStores(): string[] {
  return VALID_STORES
}
