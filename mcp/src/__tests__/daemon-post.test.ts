// Integration test pra daemonPost — sobe um Bun.serve fake na porta de
// teste e verifica que 409 'project_locked' vira ProjectLockedError com
// payload preservado. Detecta regressao do parsing.

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { daemonPost, ProjectLockedError } from '../api'

const TEST_PORT = 14801

let server: ReturnType<typeof Bun.serve> | null = null

beforeAll(() => {
  process.env.COCKPIT_DAEMON_URL = `http://127.0.0.1:${TEST_PORT}`
  server = Bun.serve({
    port: TEST_PORT,
    hostname: '127.0.0.1',
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/echo') {
        return new Response(JSON.stringify({ ok: true, path: url.pathname }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.pathname === '/locked') {
        return new Response(
          JSON.stringify({
            error: 'project_locked',
            message: 'em uso',
            project_path: '/tmp/foo',
            held_by: {
              session_id: 'sess-9',
              card_id: 'card-fake',
              workspace_slug: 'fake-ws',
              agent: 'claude-code',
              acquired_at: '2026-05-06T00:00:00Z',
              age_seconds: 12,
            },
            hints: ['aguarde', 'aborte'],
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.pathname === '/random-fail') {
        return new Response('boom', { status: 500 })
      }
      return new Response('not found', { status: 404 })
    },
  })
})

afterAll(() => {
  server?.stop()
  server = null
})

describe('daemonPost', () => {
  test('payload simples retorna json parseado', async () => {
    const out = await daemonPost<{ ok: boolean; path: string }>('/echo', { x: 1 })
    expect(out.ok).toBe(true)
    expect(out.path).toBe('/echo')
  })

  test('409 project_locked vira ProjectLockedError com payload completo', async () => {
    try {
      await daemonPost('/locked', {})
      expect.unreachable('deveria ter lançado')
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectLockedError)
      const e = err as ProjectLockedError
      expect(e.projectPath).toBe('/tmp/foo')
      expect(e.heldBy.session_id).toBe('sess-9')
      expect(e.heldBy.card_id).toBe('card-fake')
      expect(e.heldBy.age_seconds).toBe(12)
      expect(e.hints).toEqual(['aguarde', 'aborte'])
    }
  })

  test('500 vira Error generico (nao ProjectLockedError)', async () => {
    try {
      await daemonPost('/random-fail', {})
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(ProjectLockedError)
      expect((err as Error).message).toContain('500')
    }
  })

  test('404 vira Error generico', async () => {
    try {
      await daemonPost('/missing', {})
      expect.unreachable()
    } catch (err) {
      expect((err as Error).message).toContain('404')
    }
  })
})
