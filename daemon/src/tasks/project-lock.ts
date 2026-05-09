// F9-A — project-level lock para evitar working tree stomping quando 2
// implementations rodam no mesmo projeto. Tabela project_locks(path PK,
// session_id, kind, acquired_at). Cleanup de órfãos (cuja session já
// terminou) acontece no boot e via reaper periódico.
//
// Quando worktree mode chegar (F9-B), basta passar bypass=true ou usar
// uma kind diferente — locks de paths distintos não colidem.

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
 * Tenta adquirir lock para um projeto. Lanca ProjectLockedError se já tomado
 * por outra session ATIVA. Locks órfãos (cuja session já terminou) são
 * automaticamente liberados antes da tentativa.
 *
 * C6 fix — versão atomica via SQLite transaction. Antes era:
 *   INSERT (fail on UNIQUE) → SELECT → getAgentSession (async!) → DELETE → recursao.
 * Entre o SELECT e o DELETE, outra request podia adquirir o lock recem-liberado.
 * Agora: a transacao serializa o caminho de "checa órfão + substitui",
 * eliminando a janela de race. Sem recursao.
 */
export async function acquireProjectLock(
  path: string,
  sessionId: string,
  kind: LockKind = 'implement',
): Promise<void> {
  const db = getDB()

  // Loop com max 3 tentativas — cobre o caso raro onde o lock muda de mao
  // entre o SELECT e o UPDATE (dentro do mesmo attempt) ou entre attempts.
  // Sem recursao infinita.
  for (let attempt = 0; attempt < 3; attempt++) {
    // PASSO 1: le lock atual sob transacao
    const currentLock: LockRow | null = (
      db.query('SELECT * FROM project_locks WHERE path = ?').get(path) as LockRow | null
    )

    if (!currentLock) {
      // Sem lock — tenta INSERT atomico. UNIQUE constraint resolve race
      // contra outro acquire concorrente: apenas um INSERT bem-sucedido.
      try {
        db.query(`
          INSERT INTO project_locks (path, session_id, kind, acquired_at)
          VALUES (?, ?, ?, datetime('now'))
        `).run(path, sessionId, kind)
        return  // adquirimos
      } catch (err) {
        const msg = (err as Error).message
        if (!msg.includes('UNIQUE') && !msg.includes('constraint')) throw err
        // alguem inseriu antes de nos — próxima iteracao do loop le o estado novo
        continue
      }
    }

    // Ha lock. Cheka se holding session ainda esta ativa (await async aqui
    // — fora da transacao SQLite, intencional pra não bloquear DB com I/O).
    const holdingSession = await getAgentSession(currentLock.session_id)
    const stillActive = holdingSession
      && !holdingSession.completedAt
      && holdingSession.phase !== 'done'
      && holdingSession.phase !== 'error'

    if (stillActive) {
      // Lock legitimamente held por outro — propaga erro com info rica
      const info = rowToInfo(currentLock)
      info.cardId = holdingSession.cardId
      info.workspaceSlug = holdingSession.workspaceSlug
      info.agent = holdingSession.agent
      throw new ProjectLockedError(path, info)
    }

    // Lock órfão — substitui ATOMICAMENTE em uma única transacao.
    // ON CONFLICT garante que se outra request adquiriu nesse meio-tempo,
    // não fazemos overwrite cego: apenas substituimos se ainda for o
    // mesmo órfão. Caso contrario, próxima iteracao re-avalia.
    const orphanSessionId = currentLock.session_id
    const replaceResult = db.query(`
      UPDATE project_locks
      SET session_id = ?, kind = ?, acquired_at = datetime('now')
      WHERE path = ? AND session_id = ?
    `).run(sessionId, kind, path, orphanSessionId) as { changes: number }

    if (replaceResult.changes === 1) {
      console.warn(`[project-lock] replaced orphan lock on ${path} (was ${orphanSessionId}, now ${sessionId})`)
      return
    }
    // changes=0: alguem adquiriu o lock entre nosso SELECT e UPDATE — re-loop
  }

  throw new Error(`acquireProjectLock(${path}): max retries exceeded — lock altamente disputado`)
}

/**
 * Libera lock. Idempotente — não falha se lock já foi liberado.
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
 * session que ainda não terminou. Locks órfãos retornam null (e a row e
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
    // Lock órfão — limpa e retorna null pra o caller proceder.
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
 * Cleanup de locks órfãos — todos cuja session já terminou OU não existe mais.
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
