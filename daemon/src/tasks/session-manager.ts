import { getDB } from '../persistence/db'

// Generic agent session — works for spec / implementation / discovery / chat.
// Wraps the legacy implement-session schema with extra columns (action, model, chunks).
export type SessionAction = 'spec' | 'implementation' | 'discovery' | 'chat'
export type SessionPhase = 'analyzing' | 'branching' | 'implementing' | 'creating-pr' | 'done' | 'error' | 'running'

export interface AgentSession {
  id: string
  workspaceSlug: string
  cardId: string
  action: SessionAction
  agent: string
  model: string | null
  phase: SessionPhase
  startedAt: string
  completedAt: string | null
  duration: number | null
  exitCode: number | null
  chunks: string[]   // incremental text stream from agent
  error: string | null
  // implementation-only fields kept here for compat
  attempt: number
  branch: string | null
  feedback: string | null
  summary: SessionSummary | null
  output: string[]
  files: SessionFile[]
}

export interface SessionFile {
  path: string
  action: 'modified' | 'created' | 'deleted' | 'changed'
}

export interface SessionSummary {
  filesModified: number
  filesCreated: number
  filesDeleted: number
  branch: string | null
  prUrl?: string
  prNumber?: number
}

export interface ImplementSession {
  id: string
  attempt: number
  agent: string
  branch: string | null
  phase: 'analyzing' | 'branching' | 'implementing' | 'creating-pr' | 'done' | 'error'
  exitCode: number | null
  startedAt: string
  completedAt: string | null
  duration: number | null
  feedback: string | null
  summary: SessionSummary | null
  output: string[]
  files: SessionFile[]
  error: string | null
}

interface SessionRow {
  id: string
  workspace_slug: string
  card_id: string
  attempt: number
  agent: string
  branch: string | null
  phase: string
  exit_code: number | null
  started_at: string
  completed_at: string | null
  duration: number | null
  feedback: string | null
  summary: string | null
  output: string | null
  files: string | null
  error: string | null
  // v2 columns
  action: string | null
  model: string | null
  chunks: string | null
}

function rowToSession(row: SessionRow): ImplementSession {
  return {
    id: row.id,
    attempt: row.attempt,
    agent: row.agent,
    branch: row.branch,
    phase: row.phase as ImplementSession['phase'],
    exitCode: row.exit_code,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    duration: row.duration,
    feedback: row.feedback,
    summary: row.summary ? JSON.parse(row.summary) : null,
    output: row.output ? JSON.parse(row.output) : [],
    files: row.files ? JSON.parse(row.files) : [],
    error: row.error,
  }
}

function rowToAgentSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    workspaceSlug: row.workspace_slug,
    cardId: row.card_id,
    action: (row.action || 'implementation') as SessionAction,
    agent: row.agent,
    model: row.model,
    phase: row.phase as SessionPhase,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    duration: row.duration,
    exitCode: row.exit_code,
    chunks: row.chunks ? JSON.parse(row.chunks) : [],
    error: row.error,
    attempt: row.attempt,
    branch: row.branch,
    feedback: row.feedback,
    summary: row.summary ? JSON.parse(row.summary) : null,
    output: row.output ? JSON.parse(row.output) : [],
    files: row.files ? JSON.parse(row.files) : [],
  }
}

export async function createSession(wsSlug: string, cardId: string, data: {
  agent: string
  branch: string | null
  attempt: number
  feedback: string | null
}): Promise<ImplementSession> {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  const id = `session-${ts}-${rand}`

  const session: ImplementSession = {
    id,
    attempt: data.attempt,
    agent: data.agent,
    branch: data.branch,
    phase: 'analyzing',
    exitCode: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    duration: null,
    feedback: data.feedback,
    summary: null,
    output: [],
    files: [],
    error: null,
  }

  getDB().query(`INSERT INTO sessions (id, workspace_slug, card_id, attempt, agent, branch, phase, started_at, feedback, output, files)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, wsSlug, cardId, data.attempt, data.agent, data.branch,
    'analyzing', session.startedAt, data.feedback, '[]', '[]',
  )

  return session
}

export async function updateSession(
  wsSlug: string,
  cardId: string,
  sessionId: string,
  updates: Partial<ImplementSession>,
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.phase !== undefined) { sets.push('phase = ?'); values.push(updates.phase) }
  if (updates.exitCode !== undefined) { sets.push('exit_code = ?'); values.push(updates.exitCode) }
  if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(updates.completedAt) }
  if (updates.duration !== undefined) { sets.push('duration = ?'); values.push(updates.duration) }
  if (updates.summary !== undefined) { sets.push('summary = ?'); values.push(JSON.stringify(updates.summary)) }
  if (updates.output !== undefined) { sets.push('output = ?'); values.push(JSON.stringify(updates.output)) }
  if (updates.files !== undefined) { sets.push('files = ?'); values.push(JSON.stringify(updates.files)) }
  if (updates.error !== undefined) { sets.push('error = ?'); values.push(updates.error) }

  if (sets.length === 0) return

  values.push(sessionId)
  getDB().query(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export async function appendOutput(
  wsSlug: string,
  cardId: string,
  sessionId: string,
  line: string,
): Promise<void> {
  // Atomic JSON array append in SQLite
  getDB().query(`UPDATE sessions SET output = json_insert(
    CASE WHEN output IS NULL THEN '[]' ELSE output END,
    '$[#]', ?
  ) WHERE id = ?`).run(line, sessionId)
}

export async function appendFile(
  wsSlug: string,
  cardId: string,
  sessionId: string,
  trackedFile: SessionFile,
): Promise<void> {
  // Check if file already tracked (read from DB, not memory)
  const row = getDB().query('SELECT files FROM sessions WHERE id = ?').get(sessionId) as { files: string } | null
  if (!row) return

  const files: SessionFile[] = JSON.parse(row.files || '[]')
  if (files.some((f) => f.path === trackedFile.path)) return

  files.push(trackedFile)
  getDB().query('UPDATE sessions SET files = ? WHERE id = ?').run(JSON.stringify(files), sessionId)
}

export async function listSessions(wsSlug: string, cardId: string): Promise<ImplementSession[]> {
  const rows = getDB().query(
    'SELECT * FROM sessions WHERE workspace_slug = ? AND card_id = ? ORDER BY started_at ASC',
  ).all(wsSlug, cardId) as SessionRow[]

  return rows.map(rowToSession)
}

export async function getLatestSession(wsSlug: string, cardId: string): Promise<ImplementSession | null> {
  const row = getDB().query(
    'SELECT * FROM sessions WHERE workspace_slug = ? AND card_id = ? ORDER BY started_at DESC LIMIT 1',
  ).get(wsSlug, cardId) as SessionRow | null

  return row ? rowToSession(row) : null
}

export async function getSession(wsSlug: string, cardId: string, sessionId: string): Promise<ImplementSession | null> {
  const row = getDB().query('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow | null
  return row ? rowToSession(row) : null
}

// ── Generic agent session API (N2) ──

export async function createAgentSession(data: {
  workspaceSlug: string
  cardId: string
  action: SessionAction
  agent: string
  model?: string | null
  attempt?: number
  feedback?: string | null
}): Promise<AgentSession> {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const startedAt = new Date().toISOString()
  const initialPhase: SessionPhase = data.action === 'implementation' ? 'analyzing' : 'running'

  getDB().query(`
    INSERT INTO sessions (id, workspace_slug, card_id, attempt, agent, branch, phase, started_at, feedback, output, files, action, model, chunks)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, '[]', '[]', ?, ?, '[]')
  `).run(
    id, data.workspaceSlug, data.cardId, data.attempt ?? 1, data.agent,
    initialPhase, startedAt, data.feedback ?? null,
    data.action, data.model ?? null,
  )

  return {
    id,
    workspaceSlug: data.workspaceSlug,
    cardId: data.cardId,
    action: data.action,
    agent: data.agent,
    model: data.model ?? null,
    phase: initialPhase,
    startedAt,
    completedAt: null,
    duration: null,
    exitCode: null,
    chunks: [],
    error: null,
    attempt: data.attempt ?? 1,
    branch: null,
    feedback: data.feedback ?? null,
    summary: null,
    output: [],
    files: [],
  }
}

// Append a stream chunk atomically. Used for spec/chat/discovery (text deltas).
// Also bumps updated_at — used by the reaper to detect stale sessions.
export async function appendChunk(sessionId: string, text: string): Promise<void> {
  getDB().query(`
    UPDATE sessions SET
      chunks = json_insert(
        CASE WHEN chunks IS NULL THEN '[]' ELSE chunks END,
        '$[#]', ?
      ),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(text, sessionId)
}

export async function finishAgentSession(
  sessionId: string,
  result: { phase: SessionPhase; error?: string | null; exitCode?: number | null },
): Promise<void> {
  const completedAt = new Date().toISOString()
  const sets: string[] = ['phase = ?', 'completed_at = ?', 'updated_at = ?']
  const values: unknown[] = [result.phase, completedAt, completedAt]

  if (result.error !== undefined) { sets.push('error = ?'); values.push(result.error) }
  if (result.exitCode !== undefined) { sets.push('exit_code = ?'); values.push(result.exitCode) }

  // Compute duration from started_at
  const row = getDB().query('SELECT started_at FROM sessions WHERE id = ?').get(sessionId) as { started_at: string } | null
  if (row) {
    const dur = Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000)
    sets.push('duration = ?')
    values.push(dur)
  }

  values.push(sessionId)
  getDB().query(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

// Reaper — marca como timeout sessions running ha mais de `staleAfterMin`
// minutos sem updated_at. Chamado periodicamente pelo runtime do daemon.
// Retorna o numero de sessions limpas.
export async function reapStaleSessions(staleAfterMin = 30): Promise<number> {
  const cutoffMin = Math.max(1, staleAfterMin)
  // Usa COALESCE para sessoes sem updated_at (legado) — cai pra started_at
  const result = getDB().query(`
    UPDATE sessions
    SET phase = 'error',
        error = 'Sessao stale (sem atividade ha mais de ${cutoffMin}min — agent travou ou processo morreu)',
        completed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE phase NOT IN ('done', 'error')
      AND completed_at IS NULL
      AND COALESCE(updated_at, started_at) < datetime('now', '-${cutoffMin} minutes')
  `).run() as { changes: number }
  return result.changes
}

// Returns all sessions still running (phase NOT IN done/error). Used by frontend
// at app boot to reconcile state after a reload.
export async function listRunningSessions(): Promise<AgentSession[]> {
  const rows = getDB().query(`
    SELECT * FROM sessions
    WHERE phase NOT IN ('done', 'error')
      AND completed_at IS NULL
    ORDER BY started_at ASC
  `).all() as SessionRow[]
  return rows.map(rowToAgentSession)
}

export async function getAgentSession(sessionId: string): Promise<AgentSession | null> {
  const row = getDB().query('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow | null
  return row ? rowToAgentSession(row) : null
}

// Latest session for a card filtered by action — used for spec/chat reidratation.
export async function getLatestAgentSession(
  wsSlug: string,
  cardId: string,
  action?: SessionAction,
): Promise<AgentSession | null> {
  const sql = action
    ? 'SELECT * FROM sessions WHERE workspace_slug = ? AND card_id = ? AND action = ? ORDER BY started_at DESC LIMIT 1'
    : 'SELECT * FROM sessions WHERE workspace_slug = ? AND card_id = ? ORDER BY started_at DESC LIMIT 1'
  const params = action ? [wsSlug, cardId, action] : [wsSlug, cardId]
  const row = getDB().query(sql).get(...params) as SessionRow | null
  return row ? rowToAgentSession(row) : null
}
