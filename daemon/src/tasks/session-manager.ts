import { getDB } from '../persistence/db'

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
