import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, readdir } from 'node:fs/promises'

const TASKS_DIR = join(homedir(), '.cockpit', 'tasks')

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

function sessionsDir(wsSlug: string, cardId: string): string {
  return join(TASKS_DIR, wsSlug, cardId, 'sessions')
}

function sessionPath(wsSlug: string, cardId: string, sessionId: string): string {
  return join(sessionsDir(wsSlug, cardId), `${sessionId}.json`)
}

export async function createSession(wsSlug: string, cardId: string, data: {
  agent: string
  branch: string | null
  attempt: number
  feedback: string | null
}): Promise<ImplementSession> {
  const dir = sessionsDir(wsSlug, cardId)
  await mkdir(dir, { recursive: true })

  // Use timestamp + random suffix for collision-free IDs
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

  await Bun.write(sessionPath(wsSlug, cardId, id), JSON.stringify(session, null, 2))
  return session
}

export async function updateSession(
  wsSlug: string,
  cardId: string,
  sessionId: string,
  updates: Partial<ImplementSession>,
): Promise<void> {
  const path = sessionPath(wsSlug, cardId, sessionId)
  const file = Bun.file(path)
  if (!await file.exists()) return

  const current = await file.json() as ImplementSession
  const updated = { ...current, ...updates }
  await Bun.write(path, JSON.stringify(updated, null, 2))
}

export async function appendOutput(
  wsSlug: string,
  cardId: string,
  sessionId: string,
  line: string,
): Promise<void> {
  const path = sessionPath(wsSlug, cardId, sessionId)
  const file = Bun.file(path)
  if (!await file.exists()) return

  const current = await file.json() as ImplementSession
  current.output.push(line)
  await Bun.write(path, JSON.stringify(current, null, 2))
}

export async function appendFile(
  wsSlug: string,
  cardId: string,
  sessionId: string,
  trackedFile: SessionFile,
): Promise<void> {
  const path = sessionPath(wsSlug, cardId, sessionId)
  const file = Bun.file(path)
  if (!await file.exists()) return

  const current = await file.json() as ImplementSession
  if (!current.files.some((f) => f.path === trackedFile.path)) {
    current.files.push(trackedFile)
    await Bun.write(path, JSON.stringify(current, null, 2))
  }
}

export async function listSessions(wsSlug: string, cardId: string): Promise<ImplementSession[]> {
  const dir = sessionsDir(wsSlug, cardId)
  try {
    const entries = await readdir(dir)
    const sessions: ImplementSession[] = []
    for (const entry of entries.filter((e) => e.endsWith('.json')).sort()) {
      const file = Bun.file(join(dir, entry))
      if (await file.exists()) {
        sessions.push(await file.json())
      }
    }
    return sessions
  } catch {
    return []
  }
}

export async function getLatestSession(wsSlug: string, cardId: string): Promise<ImplementSession | null> {
  const sessions = await listSessions(wsSlug, cardId)
  return sessions.length > 0 ? sessions[sessions.length - 1] : null
}

export async function getSession(wsSlug: string, cardId: string, sessionId: string): Promise<ImplementSession | null> {
  const path = sessionPath(wsSlug, cardId, sessionId)
  const file = Bun.file(path)
  if (!await file.exists()) return null
  return await file.json()
}
