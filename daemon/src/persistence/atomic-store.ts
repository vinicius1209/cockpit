// Atomic store primitive — fix C1 do code review.
//
// Antes: 4 callsites em daemon/CLI/MCP faziam read-modify-write sem
// proteção. Dois writes concorrentes ao mesmo store causavam Lost Update
// (segundo write sobrescrevia mutações do primeiro).
//
// Agora: dois mecanismos complementares.
//
// 1) atomicMutate(name, mutator) — pra CÓDIGO INTERNO do daemon. Usa
//    SQLite transação BEGIN IMMEDIATE → serializa writes do mesmo store
//    no mesmo processo (Bun é single-thread mas múltiplas requests
//    HTTP entrelaçam).
//
// 2) writeStoreIfVersion(name, data, expectedVersion) — pra CLIENTES
//    REMOTOS (CLI/MCP). Versionamento otimista: cliente envia o version
//    que ele leu; daemon compara com versão atual; mismatch → 409.
//    Cliente refetch + retry. Sem mutex no cliente.
//
// Migration v5 (db.ts) adiciona kv_stores.version.

import { getDB } from './db'

export interface KvStoreSnapshot<T = unknown> {
  data: T
  version: number
}

export class StoreVersionConflictError extends Error {
  readonly current: KvStoreSnapshot<unknown>
  constructor(public storeName: string, expected: number, current: KvStoreSnapshot<unknown>) {
    super(`store "${storeName}" version mismatch: expected ${expected}, current ${current.version}`)
    this.name = 'StoreVersionConflictError'
    this.current = current
  }
}

/**
 * Lê snapshot do store (data + version atual).
 * Retorna null se store nunca foi inicializado.
 * NAO transacional — apenas leitura.
 */
export function readStore<T = unknown>(name: string): KvStoreSnapshot<T> | null {
  const row = getDB().query('SELECT data, version FROM kv_stores WHERE store_name = ?').get(name) as { data: string; version: number } | null
  if (!row) return null
  try {
    return { data: JSON.parse(row.data) as T, version: row.version }
  } catch {
    return null
  }
}

/**
 * Mutate atômico. Single-process serialization via SQLite transação
 * BEGIN IMMEDIATE. Use SEMPRE em código daemon-internal (updateCardPrUrl,
 * updateCardSpecContent, etc) — substitui o padrão SELECT → JSON.parse →
 * mutate → INSERT OR REPLACE que tinha Lost Update.
 *
 * Mutator recebe `current` (parsed) e retorna `next`. Se mutator retornar
 * o mesmo objeto sem mudança, ainda incrementa version (preserva semântica
 * de "houve write").
 *
 * Throws se store não existe (precisa ter sido inicializado antes).
 */
export function atomicMutate<T = unknown>(
  name: string,
  mutator: (current: T) => T,
): KvStoreSnapshot<T> {
  const db = getDB()
  // BEGIN IMMEDIATE bloqueia outros writers até COMMIT — serializa.
  // SELECT + UPDATE no mesmo block garante atomicidade.
  let result: KvStoreSnapshot<T> | null = null
  db.transaction(() => {
    const row = db.query('SELECT data, version FROM kv_stores WHERE store_name = ?').get(name) as { data: string; version: number } | null
    if (!row) {
      throw new Error(`store "${name}" not initialized — chame setStore antes`)
    }
    const current = JSON.parse(row.data) as T
    const next = mutator(current)
    const nextVersion = row.version + 1
    db.query(
      'UPDATE kv_stores SET data = ?, version = ?, updated_at = ? WHERE store_name = ?',
    ).run(JSON.stringify(next), nextVersion, new Date().toISOString(), name)
    result = { data: next, version: nextVersion }
  })()
  return result!
}

/**
 * Write condicional baseado em version. Usado pelo HTTP POST /api/data/:store.
 * Cliente envia o version que ele leu; se já mudou (version atual > expected),
 * retorna { ok: false, current } e cliente refetch+retry.
 *
 * `expectedVersion = -1` faz force-write (skip check) — usado por flows
 * legados que ainda não migraram pra optimistic locking.
 */
export function writeStoreIfVersion<T = unknown>(
  name: string,
  data: T,
  expectedVersion: number,
): { ok: true; version: number } | { ok: false; current: KvStoreSnapshot<unknown> } {
  const db = getDB()
  let resp: { ok: true; version: number } | { ok: false; current: KvStoreSnapshot<unknown> } | null = null
  db.transaction(() => {
    const row = db.query('SELECT data, version FROM kv_stores WHERE store_name = ?').get(name) as { data: string; version: number } | null
    const currentVersion = row?.version ?? 0
    if (expectedVersion !== -1 && expectedVersion !== currentVersion) {
      // Conflito — retorna estado atual pro caller fazer 3-way merge ou retry
      const currentData = row ? JSON.parse(row.data) as unknown : {}
      resp = { ok: false, current: { data: currentData, version: currentVersion } }
      return
    }
    const nextVersion = currentVersion + 1
    db.query(
      'INSERT INTO kv_stores (store_name, data, version, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(store_name) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at',
    ).run(name, JSON.stringify(data), nextVersion, new Date().toISOString())
    resp = { ok: true, version: nextVersion }
  })()
  return resp!
}

/**
 * Force-write — usado pelo SqliteJsonStore.set() interno e por testes.
 * Pula version check (incrementa anyway). NAO usar em paths de cliente.
 */
export function setStore<T>(name: string, data: T): number {
  const result = writeStoreIfVersion(name, data, -1)
  if (!result.ok) throw new Error('writeStoreIfVersion -1 retornou conflict (impossível)')
  return result.version
}
