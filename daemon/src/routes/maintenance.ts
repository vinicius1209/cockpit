// Endpoints de manutencao — chamados pelo `cockpit doctor --fix`.
// Soh executam side effects quando POST (GET retorna preview/contagem).

import { jsonResponse } from '../http'
import { reapStaleSessions } from '../tasks/session-manager'
import { reapOrphanLocks, getProjectLock } from '../tasks/project-lock'
import { getDB } from '../persistence/db'

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
