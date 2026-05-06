// Tests do atomic-store primitive — fix C1 do code review (Lost Update).
//
// Cobertura crítica: simular concorrência via Promise.all de mutates
// sobre o mesmo store. SEM o atomicMutate (read-modify-write antigo),
// alguns updates seriam perdidos. COM atomicMutate (BEGIN IMMEDIATE
// transaction), todas as mutações se preservam.

import { describe, test, expect, beforeAll } from 'bun:test'
import { initDB } from '../persistence/db'
import {
  atomicMutate,
  readStore,
  writeStoreIfVersion,
  setStore,
  StoreVersionConflictError,
} from '../persistence/atomic-store'

beforeAll(async () => {
  await initDB()
})

interface Counter { count: number; log: string[] }

const newStoreName = (prefix: string) => `_test_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

describe('atomic-store — basics', () => {
  test('readStore retorna null se store nao existe', () => {
    expect(readStore(newStoreName('missing'))).toBeNull()
  })

  test('setStore cria store e retorna version', () => {
    const name = newStoreName('basic-set')
    const v1 = setStore<Counter>(name, { count: 5, log: ['a'] })
    expect(v1).toBeGreaterThan(0)
    const snap = readStore<Counter>(name)
    expect(snap).not.toBeNull()
    expect(snap!.data.count).toBe(5)
    expect(snap!.version).toBe(v1)
  })

  test('setStore segundo write incrementa version', () => {
    const name = newStoreName('basic-inc')
    const v1 = setStore<Counter>(name, { count: 1, log: [] })
    const v2 = setStore<Counter>(name, { count: 2, log: [] })
    expect(v2).toBeGreaterThan(v1)
    expect(readStore<Counter>(name)!.version).toBe(v2)
  })

  test('atomicMutate aplica funcao e incrementa version', () => {
    const name = newStoreName('basic-mutate')
    setStore<Counter>(name, { count: 0, log: [] })

    const result = atomicMutate<Counter>(name, (cur) => ({
      count: cur.count + 1,
      log: [...cur.log, 'first'],
    }))

    expect(result.data.count).toBe(1)
    expect(result.data.log).toEqual(['first'])
    expect(result.version).toBe(2)  // setStore=v1, atomicMutate=v2
  })

  test('atomicMutate falha se store nao existe', () => {
    expect(() => {
      atomicMutate<Counter>(newStoreName('missing'), (cur) => cur)
    }).toThrow(/not initialized/)
  })
})

describe('atomic-store — concorrência (regressão C1 Lost Update)', () => {
  test('Promise.all de N mutates incrementa todos sem perda', async () => {
    const name = newStoreName('concurrent')
    setStore<Counter>(name, { count: 0, log: [] })

    const N = 50
    const ops = Array.from({ length: N }, (_, i) =>
      Promise.resolve().then(() =>
        atomicMutate<Counter>(name, (cur) => ({
          count: cur.count + 1,
          log: [...cur.log, `op-${i}`],
        }))
      )
    )

    await Promise.all(ops)

    const final = readStore<Counter>(name)!
    expect(final.data.count).toBe(N)  // sem Lost Update — todos os 50 incrementos preservados
    expect(final.data.log.length).toBe(N)
    // Cada op-i aparece exatamente 1 vez
    const seen = new Set(final.data.log)
    expect(seen.size).toBe(N)
  })

  test('mutates concorrentes em campos diferentes nao perdem nenhum', async () => {
    interface Multi { a: number; b: number; c: number }
    const name = newStoreName('multi-field')
    setStore<Multi>(name, { a: 0, b: 0, c: 0 })

    await Promise.all([
      ...Array.from({ length: 10 }, () => Promise.resolve().then(() =>
        atomicMutate<Multi>(name, (cur) => ({ ...cur, a: cur.a + 1 })))),
      ...Array.from({ length: 20 }, () => Promise.resolve().then(() =>
        atomicMutate<Multi>(name, (cur) => ({ ...cur, b: cur.b + 1 })))),
      ...Array.from({ length: 30 }, () => Promise.resolve().then(() =>
        atomicMutate<Multi>(name, (cur) => ({ ...cur, c: cur.c + 1 })))),
    ])

    const final = readStore<Multi>(name)!
    expect(final.data.a).toBe(10)
    expect(final.data.b).toBe(20)
    expect(final.data.c).toBe(30)
  })
})

describe('atomic-store — optimistic locking (writeStoreIfVersion)', () => {
  test('write com version correto succeeds', () => {
    const name = newStoreName('optimistic-ok')
    setStore<Counter>(name, { count: 1, log: [] })
    const snap = readStore<Counter>(name)!

    const result = writeStoreIfVersion(name, { count: 99, log: ['updated'] }, snap.version)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.version).toBe(snap.version + 1)
    }
  })

  test('write com version stale retorna 409 com current snapshot', () => {
    const name = newStoreName('optimistic-conflict')
    const v1 = setStore<Counter>(name, { count: 1, log: [] })
    // Outro cliente atualizou o store
    setStore<Counter>(name, { count: 2, log: ['concurrent'] })

    // Tentamos escrever com a versao antiga
    const result = writeStoreIfVersion(name, { count: 999, log: ['stale'] }, v1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.current.version).toBeGreaterThan(v1)
      expect((result.current.data as Counter).count).toBe(2)
    }
  })

  test('expectedVersion=-1 e force-write (skip check)', () => {
    const name = newStoreName('force')
    setStore<Counter>(name, { count: 1, log: [] })
    setStore<Counter>(name, { count: 2, log: [] })  // version=2

    const result = writeStoreIfVersion(name, { count: 99, log: ['forced'] }, -1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(readStore<Counter>(name)!.data.count).toBe(99)
    }
  })

  test('writeStoreIfVersion concorrente — apenas uma succeeds, resto vê 409', async () => {
    const name = newStoreName('optimistic-concurrent')
    setStore<Counter>(name, { count: 0, log: [] })
    const snap = readStore<Counter>(name)!

    const ops = Array.from({ length: 5 }, (_, i) =>
      Promise.resolve().then(() =>
        writeStoreIfVersion(name, { count: i + 1, log: [`writer-${i}`] }, snap.version)
      )
    )

    const results = await Promise.all(ops)
    const successes = results.filter((r) => r.ok)
    const conflicts = results.filter((r) => !r.ok)

    // Soh um vai conseguir com a versao snap.version. Os demais batem 409.
    expect(successes.length).toBe(1)
    expect(conflicts.length).toBe(4)
  })
})

// Type cleanup — StoreVersionConflictError exportado mas nao usado em tests
// (writeStoreIfVersion retorna disjunto em vez de throw — escolha de design)
void StoreVersionConflictError
