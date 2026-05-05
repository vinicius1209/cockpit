// F9-A — project-level lock para evitar working tree stomping quando 2
// implementations rodam no mesmo projeto. Tabela project_locks(path PK,
// session_id, kind, acquired_at). Cleanup de orfaos (cuja session ja
// terminou) acontece no boot e via reaper periodico.
//
// Quando worktree mode chegar (F9-B), basta passar bypass=true ou usar
// uma kind diferente — locks de paths distintos nao colidem.

import { getDB } from '../persistence/db'
import { getAgentSession } from './session-manager'

export type LockKind = 'implement'

export class ProjectLockedError extends Error {
  readonly path: string
  readonly heldBy: ProjectLockInfo
  constructor(path: string, heldBy: ProjectLockInfo) {
    super(`project locked: ${path} (session ${heldBy.sessionId}, started ${heldBy.acquiredAt})`)
    this.name = 'ProjectLockedError'
    this.path = path
    this.heldBy = heldBy
  }
}

export interface ProjectLockInfo {
  path: string
  sessionId: string
  kind: LockKind
  acquiredAt: string  // ISO
  // Hidratado lazy via getLockedBy() pra mensagens de erro ricas:
  cardId?: string
  workspaceSlug?: string
  agent?: string
  ageSeconds?: number
}

interface LockRow {
  path: string
  session_id: string
  kind: string
  acquired_at: string
}

function rowToInfo(row: LockRow): ProjectLockInfo {
  const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(row.acquired_at).getTime()) / 1000))
  return {
    path: row.path,
    sessionId: row.session_id,
    kind: row.kind as LockKind,
    acquiredAt: row.acquired_at,
    ageSeconds,
  }
}

/**
 * Tenta adquirir lock para um projeto. Lanca ProjectLockedError se ja tomado
 * por outra session ATIVA. Locks orfaos (cuja session ja terminou) sao
 * automaticamente liberados antes da tentativa.
 */
export async function acquireProjectLock(
  path: string,
  sessionId: string,
  kind: LockKind = 'implement',
): Promise<void> {
  // 1. Tenta INSERT (sucesso → temos o lock)
  const db = getDB()
  try {
    db.query(`
      INSERT INTO project_locks (path, session_id, kind, acquired_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(path, sessionId, kind)
    return
  } catch (err) {
    // PK conflict — alguem ja tem o lock. Verifica se eh orfao.
    const msg = (err as Error).message
    if (!msg.includes('UNIQUE') && !msg.includes('constraint')) throw err
  }

  // 2. Lock existe — verifica se a session que tomou ainda esta viva
  const row = db.query('SELECT * FROM project_locks WHERE path = ?').get(path) as LockRow | null
  if (!row) {
    // Race rara: lock foi liberado entre o INSERT e o SELECT. Tenta de novo.
    return acquireProjectLock(path, sessionId, kind)
  }

  const holdingSession = await getAgentSession(row.session_id)
  const stillActive = holdingSession
    && !holdingSession.completedAt
    && holdingSession.phase !== 'done'
    && holdingSession.phase !== 'error'

  if (stillActive) {
    const info = rowToInfo(row)
    info.cardId = holdingSession.cardId
    info.workspaceSlug = holdingSession.workspaceSlug
    info.agent = holdingSession.agent
    throw new ProjectLockedError(path, info)
  }

  // 3. Lock orfao — libera e tenta de novo
  console.warn(`[project-lock] cleaning orphan lock on ${path} (session ${row.session_id} terminated)`)
  db.query('DELETE FROM project_locks WHERE path = ?').run(path)
  return acquireProjectLock(path, sessionId, kind)
}

/**
 * Libera lock. Idempotente — nao falha se lock ja foi liberado.
 * Soh remove se a session_id bater (defesa contra release acidental por outra session).
 */
export function releaseProjectLock(path: string, sessionId: string): void {
  getDB().query('DELETE FROM project_locks WHERE path = ? AND session_id = ?').run(path, sessionId)
}

/**
 * Retorna info do lock atual (se houver). Usado pra mensagens de erro e UI.
 */
export async function getProjectLock(path: string): Promise<ProjectLockInfo | null> {
  const row = getDB().query('SELECT * FROM project_locks WHERE path = ?').get(path) as LockRow | null
  if (!row) return null
  const info = rowToInfo(row)
  const session = await getAgentSession(row.session_id)
  if (session) {
    info.cardId = session.cardId
    info.workspaceSlug = session.workspaceSlug
    info.agent = session.agent
  }
  return info
}

/**
 * Retorna info do lock SOMENTE se ele esta sendo ATIVAMENTE detido por uma
 * session que ainda nao terminou. Locks orfaos retornam null (e a row e
 * limpa como side effect). Usado por rotas pra retornar 409 ANTES de invocar
 * runImplementation (evita criar sessions zumbis quando o projeto esta bloqueado).
 */
export async function peekActiveProjectLock(path: string): Promise<ProjectLockInfo | null> {
  const row = getDB().query('SELECT * FROM project_locks WHERE path = ?').get(path) as LockRow | null
  if (!row) return null

  const session = await getAgentSession(row.session_id)
  const stillActive = session
    && !session.completedAt
    && session.phase !== 'done'
    && session.phase !== 'error'

  if (!stillActive) {
    // Lock orfao — limpa e retorna null pra o caller proceder.
    getDB().query('DELETE FROM project_locks WHERE path = ?').run(path)
    return null
  }

  const info = rowToInfo(row)
  info.cardId = session.cardId
  info.workspaceSlug = session.workspaceSlug
  info.agent = session.agent
  return info
}

/**
 * Cleanup de locks orfaos — todos cuja session ja terminou OU nao existe mais.
 * Rodar no boot e periodicamente. Retorna numero de locks limpos.
 */
export async function reapOrphanLocks(): Promise<number> {
  const db = getDB()
  // Locks cuja session NAO esta running mais (terminou ou foi deletada)
  const result = db.query(`
    DELETE FROM project_locks
    WHERE session_id NOT IN (
      SELECT id FROM sessions
      WHERE phase NOT IN ('done', 'error')
        AND completed_at IS NULL
    )
  `).run() as { changes: number }
  if (result.changes > 0) {
    console.warn(`[project-lock] reaped ${result.changes} orphan lock(s)`)
  }
  return result.changes
}
