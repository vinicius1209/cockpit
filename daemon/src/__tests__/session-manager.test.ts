import { describe, test, expect, beforeAll } from 'bun:test'
import { initDB } from '../persistence/db'
import { createSession, updateSession, appendOutput, appendFile, listSessions, getLatestSession, getSession } from '../tasks/session-manager'

const WS = '_test_sessions_' + Date.now()
const CARD = 'card-test-sess'

beforeAll(async () => {
  await initDB()
})

describe('session-manager', () => {
  test('createSession creates a session with correct fields', async () => {
    const session = await createSession(WS, CARD, {
      agent: 'claude-code',
      branch: 'fix/test-branch',
      attempt: 1,
      feedback: null,
    })

    expect(session.id).toMatch(/^session-/)
    expect(session.agent).toBe('claude-code')
    expect(session.branch).toBe('fix/test-branch')
    expect(session.attempt).toBe(1)
    expect(session.phase).toBe('analyzing')
    expect(session.output).toEqual([])
    expect(session.files).toEqual([])
    expect(session.startedAt).toBeTruthy()
  })

  test('createSession 2x generates different IDs', async () => {
    const s1 = await createSession(WS, CARD, { agent: 'claude-code', branch: null, attempt: 1, feedback: null })
    const s2 = await createSession(WS, CARD, { agent: 'claude-code', branch: null, attempt: 2, feedback: null })

    expect(s1.id).not.toBe(s2.id)
  })

  test('updateSession persists changes', async () => {
    const session = await createSession(WS, CARD, { agent: 'test', branch: null, attempt: 1, feedback: null })

    await updateSession(WS, CARD, session.id, {
      phase: 'done',
      exitCode: 0,
      completedAt: new Date().toISOString(),
    })

    const loaded = await getSession(WS, CARD, session.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.phase).toBe('done')
    expect(loaded!.exitCode).toBe(0)
  })

  test('appendOutput adds lines', async () => {
    const session = await createSession(WS, CARD, { agent: 'test', branch: null, attempt: 1, feedback: null })

    await appendOutput(WS, CARD, session.id, 'line 1')
    await appendOutput(WS, CARD, session.id, 'line 2')

    const loaded = await getSession(WS, CARD, session.id)
    expect(loaded!.output).toEqual(['line 1', 'line 2'])
  })

  test('appendFile does not duplicate same path', async () => {
    const session = await createSession(WS, CARD, { agent: 'test', branch: null, attempt: 1, feedback: null })

    await appendFile(WS, CARD, session.id, { path: 'src/index.ts', action: 'modified' })
    await appendFile(WS, CARD, session.id, { path: 'src/index.ts', action: 'modified' })

    const loaded = await getSession(WS, CARD, session.id)
    expect(loaded!.files.length).toBe(1)
  })

  test('appendFile adds different paths', async () => {
    const session = await createSession(WS, CARD, { agent: 'test', branch: null, attempt: 1, feedback: null })

    await appendFile(WS, CARD, session.id, { path: 'src/a.ts', action: 'modified' })
    await appendFile(WS, CARD, session.id, { path: 'src/b.ts', action: 'created' })

    const loaded = await getSession(WS, CARD, session.id)
    expect(loaded!.files.length).toBe(2)
  })

  test('listSessions returns all sessions', async () => {
    const sessions = await listSessions(WS, CARD)
    expect(sessions.length).toBeGreaterThanOrEqual(2)

    // Should be sorted by started_at ascending
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].startedAt >= sessions[i - 1].startedAt).toBe(true)
    }
  })

  test('getLatestSession returns most recent by startedAt', async () => {
    const latest = await getLatestSession(WS, CARD)
    expect(latest).not.toBeNull()

    const all = await listSessions(WS, CARD)
    // Latest should have the most recent startedAt
    for (const s of all) {
      expect(latest!.startedAt >= s.startedAt).toBe(true)
    }
  })

  test('getSession with invalid ID returns null', async () => {
    const result = await getSession(WS, CARD, 'session-nonexistent')
    expect(result).toBeNull()
  })
})
