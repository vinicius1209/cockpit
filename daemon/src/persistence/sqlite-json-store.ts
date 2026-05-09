import { atomicMutate, readStore, setStore } from './atomic-store'

/**
 * Wrapper sobre o atomic-store primitive. Oferece API tipada (.get/.set/.update)
 * pra código daemon-internal. update() agora delega ao atomicMutate (BEGIN
 * IMMEDIATE transaction) — Lost Update fix.
 *
 * IMPORTANTE: get() lê direto do DB cada chamada (sem cache em memoria).
 * Se você precisa de hot path com cache, use atomicMutate manualmente.
 */
export class SqliteJsonStore<T> {
  private storeName: string

  constructor(storeName: string, private defaultValue: T) {
    this.storeName = storeName
  }

  async init(): Promise<void> {
    // Garante que o store existe no DB com defaults
    if (!readStore(this.storeName)) {
      setStore(this.storeName, this.defaultValue)
    }
  }

  get(): T {
    const snap = readStore<T>(this.storeName)
    return snap ? snap.data : structuredClone(this.defaultValue)
  }

  set(value: T): void {
    setStore(this.storeName, value)
  }

  update(fn: (current: T) => T): void {
    atomicMutate<T>(this.storeName, (cur) => fn(cur ?? structuredClone(this.defaultValue)))
  }
}
