import { getDB } from './db'

/**
 * Drop-in replacement for DaemonFileStore that uses SQLite kv_stores table.
 * Same API: init(), get(), set(), update()
 * But with atomic transactions instead of file read-modify-write.
 */
export class SqliteJsonStore<T> {
  private data: T | null = null
  private storeName: string
  private loaded = false

  constructor(storeName: string, private defaultValue: T) {
    this.storeName = storeName
  }

  async init(): Promise<void> {
    this.load()
  }

  private load(): void {
    if (this.loaded) return
    const row = getDB().query('SELECT data FROM kv_stores WHERE store_name = ?').get(this.storeName) as { data: string } | null
    if (row) {
      try {
        this.data = JSON.parse(row.data)
      } catch {
        this.data = structuredClone(this.defaultValue)
      }
    } else {
      this.data = structuredClone(this.defaultValue)
    }
    this.loaded = true
  }

  get(): T {
    this.load() // Lazy-load on first access
    return this.data!
  }

  set(value: T): void {
    this.data = value
    getDB().query(
      'INSERT OR REPLACE INTO kv_stores (store_name, data, updated_at) VALUES (?, ?, ?)',
    ).run(this.storeName, JSON.stringify(value), new Date().toISOString())
  }

  update(fn: (current: T) => T): void {
    // Atomic: read from memory, transform, write to DB in one step
    this.set(fn(this.data))
  }
}
