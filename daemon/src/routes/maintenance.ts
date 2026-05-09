// Endpoints de manutencao — chamados pelo `cockpit doctor --fix`.
// Soh executam side effects quando POST (GET retorna preview/contagem).

import { jsonResponse } from '../http'
import { reapStaleSessions } from '../tasks/session-manager'
import { reapOrphanLocks, getProjectLock } from '../tasks/project-lock'
import { getDB } from '../persistence/db'
import { worktreeRoot } from '../git/worktree-manager'
import { existsSync } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { validateProjectPath, validateSessionId } from '../validation'

export async function handleMaintenanceRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /maintenance/reap-locks — limpa locks orfaos (cuja session ja terminou)
  if (path === '/maintenance/reap-locks' && req.method === 'POST') {
    const cleaned = await reapOrphanLocks()
    return jsonResponse({ cleaned })
  }

  // GET /maintenance/locks — lista locks atuais (debug + doctor)
  if (path === '/maintenance/locks' && req.method === 'GET') {
    const db = getDB()
    const rows = db.query('SELECT path, session_id, kind, acquired_at FROM project_locks').all() as Array<{
      path: string; session_id: string; kind: string; acquired_at: string
    }>
    const enriched = await Promise.all(rows.map(async (r) => {
      const info = await getProjectLock(r.path)
      return { ...r, active: !!info, holder: info }
    }))
    return jsonResponse({ locks: enriched })
  }

  // POST /maintenance/reap-sessions — marca sessions stale como error
  if (path === '/maintenance/reap-sessions' && req.method === 'POST') {
    const body = await req.json().catch(() => ({})) as { staleAfterMin?: number }
    const reaped = await reapStaleSessions(body.staleAfterMin || 30)
    return jsonResponse({ reaped })
  }

  // GET /maintenance/worktrees?projectPath=... — lista worktrees orfaos
  // (dirs em <projectPath>.cockpit-worktrees/ cuja session ja terminou).
  if (path === '/maintenance/worktrees' && req.method === 'GET') {
    const projectPath = url.searchParams.get('projectPath') || ''
    const valid = validateProjectPath(projectPath)
    if (!valid) return jsonResponse({ error: 'invalid projectPath' }, 400)

    const root = worktreeRoot(valid)
    if (!existsSync(root)) {
      return jsonResponse({ root, worktrees: [] })
    }

    const db = getDB()
    const activeSessions = db.query(`
      SELECT id FROM sessions
      WHERE phase NOT IN ('done', 'error') AND completed_at IS NULL
    `).all() as Array<{ id: string }>
    const activeIds = new Set(activeSessions.map((s) => s.id))

    const entries = await readdir(root).catch(() => [])
    const worktrees: Array<{ sessionId: string; path: string; orphan: boolean; sizeBytes?: number }> = []
    for (const sessionId of entries) {
      const wtPath = join(root, sessionId)
      const orphan = !activeIds.has(sessionId)
      let sizeBytes: number | undefined
      try {
        const st = await stat(wtPath)
        if (st.isDirectory()) sizeBytes = await dirSize(wtPath)
      } catch { /* ignore */ }
      worktrees.push({ sessionId, path: wtPath, orphan, sizeBytes })
    }
    return jsonResponse({ root, worktrees })
  }

  // POST /maintenance/cleanup-worktrees — remove dirs orfaos
  if (path === '/maintenance/cleanup-worktrees' && req.method === 'POST') {
    const body = await req.json().catch(() => ({})) as { projectPath?: string; force?: boolean }
    const valid = body.projectPath ? validateProjectPath(body.projectPath) : null
    if (!valid) return jsonResponse({ error: 'invalid or missing projectPath' }, 400)

    const root = worktreeRoot(valid)
    if (!existsSync(root)) return jsonResponse({ removed: 0, root })

    const db = getDB()
    const activeSessions = db.query(`
      SELECT id FROM sessions
      WHERE phase NOT IN ('done', 'error') AND completed_at IS NULL
    `).all() as Array<{ id: string }>
    const activeIds = new Set(activeSessions.map((s) => s.id))

    const entries = await readdir(root).catch(() => [])
    let removed = 0
    const errors: string[] = []
    for (const sessionId of entries) {
      // C2 fix: rejeita qualquer entry com path traversal/special char antes
      // de construir o path. Linha de defesa contra DB corrompido ou symlinks
      // injetados em <projectPath>.cockpit-worktrees/.
      if (!validateSessionId(sessionId)) {
        errors.push(`${sessionId}: rejeitado por validateSessionId (caracter invalido / path traversal)`)
        continue
      }
      if (activeIds.has(sessionId)) continue  // pula vivos
      const wtPath = join(root, sessionId)
      try {
        await rm(wtPath, { recursive: true, force: !!body.force })
        removed++
      } catch (e) {
        errors.push(`${sessionId}: ${(e as Error).message}`)
      }
    }
    return jsonResponse({ removed, root, errors })
  }

  // GET /system/info — version, paths, disk usage de ~/.cockpit/.
  // Doctor usa pra detectar version drift e disk pressure.
  if (path === '/system/info' && req.method === 'GET') {
    const cockpitDir = join(homedir(), '.cockpit')
    const dataDir = join(cockpitDir, 'data')
    const tasksDir = join(cockpitDir, 'tasks')
    const logsDir = join(cockpitDir, 'logs')

    const [dataSize, tasksSize, logsSize] = await Promise.all([
      existsSync(dataDir) ? dirSize(dataDir).catch(() => 0) : 0,
      existsSync(tasksDir) ? dirSize(tasksDir).catch(() => 0) : 0,
      existsSync(logsDir) ? dirSize(logsDir).catch(() => 0) : 0,
    ])

    return jsonResponse({
      // version eh atualizada pelo bump (sed em release). Fonte unica
      // pra doctor comparar com /health.
      daemon_version: '1.0.0',
      cockpit_dir: cockpitDir,
      paths: {
        data: dataDir,
        tasks: tasksDir,
        logs: logsDir,
      },
      sizes_bytes: {
        data: dataSize,
        tasks: tasksSize,
        logs: logsSize,
        total: dataSize + tasksSize + logsSize,
      },
      pid: process.pid,
      uptime_seconds: Math.round(process.uptime()),
    })
  }

  // GET /maintenance/zombie-sessions — preview de sessions stale
  if (path === '/maintenance/zombie-sessions' && req.method === 'GET') {
    const db = getDB()
    const minutes = Number(url.searchParams.get('staleAfterMin') || '30')
    const rows = db.query(`
      SELECT id, workspace_slug, card_id, action, agent, phase, started_at, updated_at
      FROM sessions
      WHERE phase NOT IN ('done', 'error')
        AND completed_at IS NULL
        AND COALESCE(updated_at, started_at) < datetime('now', '-${Math.max(1, minutes)} minutes')
      ORDER BY started_at DESC
    `).all() as Array<Record<string, unknown>>
    return jsonResponse({ count: rows.length, sessions: rows })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

// du -sb local — recursivo. Cap em 10k entries pra evitar travar com
// node_modules absurdos.
async function dirSize(dir: string, depth = 0, count = { n: 0 }): Promise<number> {
  if (depth > 8 || count.n > 10000) return 0
  let total = 0
  let entries: string[]
  try { entries = await readdir(dir) } catch { return 0 }
  for (const name of entries) {
    if (count.n++ > 10000) return total
    const p = join(dir, name)
    try {
      const st = await stat(p)
      if (st.isDirectory()) {
        total += await dirSize(p, depth + 1, count)
      } else {
        total += st.size
      }
    } catch { /* ignore unreadable */ }
  }
  return total
}
