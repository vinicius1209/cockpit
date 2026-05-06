// Tests do project-lock — fix C6 do code review (TOCTOU em acquireProjectLock).
//
// Cobertura:
// - acquire normal succeeds
// - acquire em path em uso por session ATIVA → ProjectLockedError
// - acquire em path com lock orfao (session done) → substitui o lock
// - concorrência: N acquires paralelos no mesmo path → exatamente 1 succeeds

import { describe, test, expect, beforeAll } from 'bun:test'
import { initDB, getDB } from '../persistence/db'
import { acquireProjectLock, releaseProjectLock, getProjectLock, ProjectLockedError } from '../tasks/project-lock'
import { createSession, updateSession } from '../tasks/session-manager'

beforeAll(async () => {
  await initDB()
})

const newPath = (prefix: string) => `/tmp/_test_lock_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`

async function makeActiveSession(wsSlug: string, cardId: string) {
  return createSession(wsSlug, cardId, {
    agent: 'claude-code',
    branch: 'fix/test',
    attempt: 1,
    feedback: null,
  })
}

async function markSessionDone(wsSlug: string, cardId: string, sessionId: string) {
  await updateSession(wsSlug, cardId, sessionId, {
    phase: 'done',
    completedAt: new Date().toISOString(),
  })
}

describe('project-lock — basics', () => {
  test('acquire em path livre succeeds', async () => {
    const path = newPath('basic-acq')
    const ws = '_test_lock_ws'
    const card = `card-${Date.now()}`
    const session = await makeActiveSession(ws, card)

    await acquireProjectLock(path, session.id)
    const info = await getProjectLock(path)
    expect(info?.sessionId).toBe(session.id)

    releaseProjectLock(path, session.id)
  })

  test('release remove o lock', async () => {
    const path = newPath('basic-rel')
    const ws = '_test_lock_ws_rel'
    const card = `card-${Date.now()}`
    const session = await makeActiveSession(ws, card)

    await acquireProjectLock(path, session.id)
    expect(await getProjectLock(path)).not.toBeNull()
    releaseProjectLock(path, session.id)
    expect(await getProjectLock(path)).toBeNull()
  })

  test('release com sessionId errado nao remove o lock (defesa)', async () => {
    const path = newPath('release-wrong')
    const ws = '_test_lock_ws_wrong'
    const card = `card-${Date.now()}`
    const session = await makeActiveSession(ws, card)

    await acquireProjectLock(path, session.id)
    releaseProjectLock(path, 'session-impostor')  // não bate
    expect(await getProjectLock(path)).not.toBeNull()  // ainda existe

    releaseProjectLock(path, session.id)  // cleanup
  })
})

describe('project-lock — held por session ativa', () => {
  test('segundo acquire em path com lock ATIVO throws ProjectLockedError', async () => {
    const path = newPath('held')
    const ws = '_test_lock_held'
    const card1 = `card-1-${Date.now()}`
    const card2 = `card-2-${Date.now()}`

    const sess1 = await makeActiveSession(ws, card1)
    const sess2 = await makeActiveSession(ws, card2)

    await acquireProjectLock(path, sess1.id)

    let caught: ProjectLockedError | null = null
    try {
      await acquireProjectLock(path, sess2.id)
    } catch (err) {
      caught = err as ProjectLockedError
    }
    expect(caught).toBeInstanceOf(ProjectLockedError)
    expect(caught!.heldBy.sessionId).toBe(sess1.id)
    expect(caught!.heldBy.cardId).toBe(card1)

    releaseProjectLock(path, sess1.id)
  })
})

describe('project-lock — orphan replacement', () => {
  test('acquire em path com lock orfao (session done) substitui sem erro', async () => {
    const path = newPath('orphan')
    const ws = '_test_lock_orphan'
    const card1 = `card-1-${Date.now()}`
    const card2 = `card-2-${Date.now()}`

    const sess1 = await makeActiveSession(ws, card1)
    await acquireProjectLock(path, sess1.id)
    // Simula: session1 terminou mas esqueceu de release_lock
    await markSessionDone(ws, card1, sess1.id)
    // Lock fica orfao em project_locks

    // Agora outra session tenta — deve substituir, NAO throw
    const sess2 = await makeActiveSession(ws, card2)
    await acquireProjectLock(path, sess2.id)  // sucesso

    const info = await getProjectLock(path)
    expect(info?.sessionId).toBe(sess2.id)  // sess2 e o novo holder

    releaseProjectLock(path, sess2.id)
  })
})

describe('project-lock — concorrência (C6 regression)', () => {
  test('N acquires paralelos no mesmo path: exatamente 1 succeeds, N-1 throws', async () => {
    const path = newPath('concurrent')
    const ws = '_test_lock_concurrent'

    const N = 10
    const sessions = await Promise.all(
      Array.from({ length: N }, (_, i) => makeActiveSession(ws, `card-${i}-${Date.now()}`)),
    )

    const ops = sessions.map((s) =>
      acquireProjectLock(path, s.id)
        .then(() => ({ ok: true, sessionId: s.id }))
        .catch((err: Error) => ({ ok: false, error: err, sessionId: s.id }))
    )

    const results = await Promise.all(ops)
    const successes = results.filter((r) => r.ok)
    const conflicts = results.filter((r) => !r.ok)

    expect(successes.length).toBe(1)
    expect(conflicts.length).toBe(N - 1)
    // Todos os conflitos sao ProjectLockedError (nao outro tipo de erro)
    for (const c of conflicts) {
      if (!c.ok) {
        expect((c as { ok: false; error: Error }).error).toBeInstanceOf(ProjectLockedError)
      }
    }

    // cleanup
    const winner = successes[0]
    if (winner.ok) releaseProjectLock(path, winner.sessionId)
  })
})

// Cleanup geral apos todos tests — remove project_locks de testes
describe('cleanup', () => {
  test('limpa locks de teste', () => {
    getDB().query("DELETE FROM project_locks WHERE path LIKE '/tmp/_test_lock_%'").run()
    expect(true).toBe(true)
  })
})
