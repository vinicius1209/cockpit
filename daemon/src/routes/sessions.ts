import { jsonResponse } from '../http'
import { listRunningSessions, getAgentSession, getLatestAgentSession, type SessionAction } from '../tasks/session-manager'

// /agents/sessions — read endpoints for session reconciliation (N3).
//
//  GET  /agents/sessions/running                 → all sessions still in flight
//  GET  /agents/sessions/:id                      → single session by id
//  GET  /agents/sessions/:wsSlug/:cardId/latest   → latest session for card (?action=spec)
export async function handleSessionRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  if (path === '/agents/sessions/running' && req.method === 'GET') {
    const sessions = await listRunningSessions()
    return jsonResponse({ sessions })
  }

  // /agents/sessions/<wsSlug>/<cardId>/latest
  const latestMatch = path.match(/^\/agents\/sessions\/([^/]+)\/([^/]+)\/latest$/)
  if (latestMatch && req.method === 'GET') {
    const [, wsSlug, cardId] = latestMatch
    const action = url.searchParams.get('action') as SessionAction | null
    const session = await getLatestAgentSession(wsSlug, cardId, action || undefined)
    return jsonResponse({ session })
  }

  // /agents/sessions/<id>
  const idMatch = path.match(/^\/agents\/sessions\/([^/]+)$/)
  if (idMatch && req.method === 'GET') {
    const [, id] = idMatch
    const session = await getAgentSession(id)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)
    return jsonResponse({ session })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
