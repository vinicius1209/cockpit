import { describe, test, expect, beforeAll } from 'bun:test'
import { initPersistence } from '../persistence'
import { handleRequest } from '../routes/router'

// Initialize persistence once (needed for route handlers) without starting server
beforeAll(async () => {
  await initPersistence()
})

function req(path: string, method = 'GET', body?: unknown): Request {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new Request(`http://localhost:4800${path}`, init)
}

async function status(path: string, method = 'GET', body?: unknown): Promise<number> {
  const res = await handleRequest(req(path, method, body))
  return res.status
}

async function json(path: string, method = 'GET', body?: unknown): Promise<{ error?: string }> {
  const res = await handleRequest(req(path, method, body))
  return res.json()
}

describe('Route validation', () => {
  // ── /api/data ──
  test('GET /api/data/invalid-store → 400', async () => {
    expect(await status('/api/data/passwords')).toBe(400)
  })

  test('GET /api/data/cards → 200', async () => {
    expect(await status('/api/data/cards')).toBe(200)
  })

  test('POST /api/data/secrets → 400 (not in whitelist)', async () => {
    expect(await status('/api/data/secrets', 'POST', {})).toBe(400)
  })

  // ── /api/tasks ──
  test('POST /api/tasks/sync without body fields → 400', async () => {
    expect(await status('/api/tasks/sync', 'POST', {})).toBe(400)
  })

  test('POST /api/tasks/sync with path traversal in slug → 400', async () => {
    expect(await status('/api/tasks/sync', 'POST', { workspaceSlug: '../etc', cardId: 'card-1' })).toBe(400)
  })

  test('GET /api/tasks/valid-ws/valid-card → 200', async () => {
    // May return empty files list, but should not 400
    const s = await status('/api/tasks/test-ws/test-card')
    expect(s).toBe(200)
  })

  test('GET /api/tasks with traversal slug → 400', async () => {
    expect(await status('/api/tasks/..%2Fetc/test-card')).toBe(400)
  })

  test('GET /api/tasks file read with invalid filename → 400', async () => {
    // sanitizeFilename rejects slashes and ..
    expect(await status('/api/tasks/ws/card/..%2F..%2Fetc%2Fpasswd')).toBe(400)
  })

  // ── /secrets ──
  test('GET /secrets/keys/invalid → 400', async () => {
    expect(await status('/secrets/keys/dropbox')).toBe(400)
  })

  test('GET /secrets/keys/claude → 200', async () => {
    expect(await status('/secrets/keys/claude')).toBe(200)
  })

  test('POST /secrets/keys/invalid → 400', async () => {
    expect(await status('/secrets/keys/invalid', 'POST', { key: 'abc' })).toBe(400)
  })

  // ── /agents/implement ──
  test('POST /agents/implement without required fields → 400', async () => {
    expect(await status('/agents/implement', 'POST', { cardTitle: 'test' })).toBe(400)
  })

  test('POST /agents/implement with invalid projectPath → 400', async () => {
    expect(await status('/agents/implement', 'POST', {
      spec: '# test', projectPath: '/etc/passwd', cardTitle: 'test',
    })).toBe(400)
  })

  // ── /health ──
  test('GET /health → 200', async () => {
    const res = await json('/health')
    expect(res).toHaveProperty('status', 'ok')
  })

  // ── 404 ──
  test('GET /nonexistent → 404', async () => {
    expect(await status('/nonexistent')).toBe(404)
  })
})
