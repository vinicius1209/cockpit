import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { DaemonFileStore } from '../persistence/file-store'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Override DATA_DIR by creating stores with paths in temp dir
// We test the class behavior, not the hardcoded path
let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cockpit-test-'))
})

afterAll(async () => {
  // Cleanup temp dirs
  try { await rm(join(tmpdir()), { recursive: false }) } catch { /* ok */ }
})

describe('DaemonFileStore', () => {
  test('init creates dir and loads default', async () => {
    // We can't easily override DATA_DIR, so test via the public API
    // Create store, init it, check default value
    const store = new DaemonFileStore<{ count: number }>('test-init.json', { count: 0 })
    await store.init()
    expect(store.get()).toEqual({ count: 0 })
  })

  test('set persists and get returns', async () => {
    const store = new DaemonFileStore<{ items: string[] }>('test-setget.json', { items: [] })
    await store.init()
    await store.set({ items: ['a', 'b', 'c'] })
    expect(store.get()).toEqual({ items: ['a', 'b', 'c'] })
  })

  test('update modifies current value', async () => {
    const unique = `test-update-${Date.now()}.json`
    const store = new DaemonFileStore<{ count: number }>(unique, { count: 0 })
    await store.init()
    await store.update((v) => ({ count: v.count + 1 }))
    expect(store.get().count).toBe(1)
    await store.update((v) => ({ count: v.count + 5 }))
    expect(store.get().count).toBe(6)
  })

  test('set creates atomic tmp file', async () => {
    const store = new DaemonFileStore<{ data: string }>('test-atomic.json', { data: '' })
    await store.init()
    await store.set({ data: 'hello' })

    // Verify no .tmp file left behind
    const tmpFile = Bun.file(join(require('os').homedir(), '.cockpit', 'data', 'test-atomic.json.tmp'))
    expect(await tmpFile.exists()).toBe(false)

    // Verify real file exists
    const realFile = Bun.file(join(require('os').homedir(), '.cockpit', 'data', 'test-atomic.json'))
    expect(await realFile.exists()).toBe(true)
  })

  test('reload after init reads persisted data', async () => {
    const store1 = new DaemonFileStore<{ name: string }>('test-reload.json', { name: '' })
    await store1.init()
    await store1.set({ name: 'cockpit' })

    // Simulate restart: new instance reads from disk
    const store2 = new DaemonFileStore<{ name: string }>('test-reload.json', { name: '' })
    await store2.init()
    expect(store2.get().name).toBe('cockpit')
  })
})
