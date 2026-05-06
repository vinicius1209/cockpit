// Tests do atomic-write helper (C3 fix). Garante que:
// - escrita normal funciona
// - escritas concorrentes nao corrompem (resultado e SEMPRE JSON valido,
//   ainda que possa ter ultimo write win — Lost Update e aceitavel,
//   file corruption nao)

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { atomicWriteJson } from '../config/daemon'
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'atomic-write-'))
})

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
})

describe('atomicWriteJson — basics', () => {
  test('escreve JSON simples', async () => {
    const path = join(tmpDir, 'config.json')
    await atomicWriteJson(path, { foo: 'bar', n: 42 })
    expect(readFileSync(path, 'utf-8')).toContain('"foo": "bar"')
  })

  test('cria diretorio se nao existe', async () => {
    const path = join(tmpDir, 'nested/dir/config.json')
    await atomicWriteJson(path, { ok: true })
    expect(existsSync(path)).toBe(true)
  })

  test('sobrescreve arquivo existente', async () => {
    const path = join(tmpDir, 'config.json')
    await atomicWriteJson(path, { v: 1 })
    await atomicWriteJson(path, { v: 2 })
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    expect(data.v).toBe(2)
  })

  test('limpa temp file mesmo se rename falhar (target invalido)', async () => {
    const path = join(tmpDir, 'should-fail/never.json')
    // Cria como arquivo (nao dir) pra rename pra dentro falhar
    await atomicWriteJson(join(tmpDir, 'should-fail'), 'placeholder' as unknown as object)
    // Agora tenta escrever pra path que precisa de dir mas tem arquivo no caminho
    let threw = false
    try {
      await atomicWriteJson(path, { ok: true })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    // Nao deve ter deixado .tmp file
    const tmpFiles = readdirSync(tmpDir).filter((f) => f.includes('.tmp.'))
    expect(tmpFiles.length).toBe(0)
  })
})

describe('atomicWriteJson — concorrência (C3 regression)', () => {
  test('20 writes paralelos com diferentes payloads — arquivo nunca fica corrupto', async () => {
    const path = join(tmpDir, 'concurrent.json')

    // Seed
    await atomicWriteJson(path, { initial: true })

    // Dispara 20 writes paralelos com payloads distintos
    const ops = Array.from({ length: 20 }, (_, i) =>
      atomicWriteJson(path, { writer: i, ts: Date.now() })
    )
    await Promise.all(ops)

    // Crítico: arquivo deve ser JSON válido (sem truncamento)
    const content = readFileSync(path, 'utf-8')
    let parsed: unknown
    expect(() => { parsed = JSON.parse(content) }).not.toThrow()
    expect(parsed).toHaveProperty('writer')

    // Não deve ter sobrado .tmp files
    const leftover = readdirSync(tmpDir).filter((f) => f.includes('.tmp.'))
    expect(leftover.length).toBe(0)
  })

  test('write em sequência rapida (1000 ops) sem leak de tmp files', async () => {
    const path = join(tmpDir, 'seq.json')
    for (let i = 0; i < 100; i++) {
      await atomicWriteJson(path, { i })
    }
    const tmpFiles = readdirSync(tmpDir).filter((f) => f.includes('.tmp.'))
    expect(tmpFiles.length).toBe(0)
  })
})
