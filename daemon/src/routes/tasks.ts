import { jsonResponse } from '../http'
import { TaskWorkspace } from '../tasks/task-workspace'
import { listSessions, getLatestSession, getSession } from '../tasks/session-manager'
import { sanitizeSlug, sanitizeFilename, validatePositiveNumber } from '../validation'

function validateSlugs(wsSlug: string, cardId: string): string | null {
  if (!sanitizeSlug(wsSlug)) return 'Invalid workspaceSlug'
  if (!sanitizeSlug(cardId)) return 'Invalid cardId'
  return null
}

export async function handleTaskRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /api/tasks/sync — sync card data to task workspace files
  if (path === '/api/tasks/sync' && req.method === 'POST') {
    try {
      const body = await req.json()
      if (!body.workspaceSlug || !body.cardId) {
        return jsonResponse({ error: 'Missing workspaceSlug or cardId' }, 400)
      }
      const slugErr = validateSlugs(body.workspaceSlug, body.cardId)
      if (slugErr) return jsonResponse({ error: slugErr }, 400)

      const taskPath = await TaskWorkspace.sync(body)
      return jsonResponse({ ok: true, taskPath })
    } catch (err) {
      return jsonResponse({ error: `Sync failed: ${err instanceof Error ? err.message : 'unknown'}` }, 500)
    }
  }

  // POST /api/tasks/feedback — save user feedback for re-implementation
  if (path === '/api/tasks/feedback' && req.method === 'POST') {
    try {
      const body = await req.json() as { workspaceSlug: string; cardId: string; feedback: string; attempt: number }
      if (!body.workspaceSlug || !body.cardId || !body.feedback) {
        return jsonResponse({ error: 'Missing workspaceSlug, cardId, or feedback' }, 400)
      }
      const slugErr = validateSlugs(body.workspaceSlug, body.cardId)
      if (slugErr) return jsonResponse({ error: slugErr }, 400)

      const attempt = validatePositiveNumber(body.attempt, 1, 100) ?? 1
      const filePath = await TaskWorkspace.writeFeedback(body.workspaceSlug, body.cardId, body.feedback, attempt)
      return jsonResponse({ ok: true, filePath })
    } catch (err) {
      return jsonResponse({ error: `Feedback failed: ${err instanceof Error ? err.message : 'unknown'}` }, 500)
    }
  }

  // GET /api/tasks/:wsSlug/:cardId/sessions — list all sessions
  const sessionsMatch = path.match(/^\/api\/tasks\/([^/]+)\/([^/]+)\/sessions$/)
  if (sessionsMatch && req.method === 'GET') {
    const slugErr = validateSlugs(sessionsMatch[1], sessionsMatch[2])
    if (slugErr) return jsonResponse({ error: slugErr }, 400)
    const sessions = await listSessions(sessionsMatch[1], sessionsMatch[2])
    return jsonResponse(sessions)
  }

  // GET /api/tasks/:wsSlug/:cardId/sessions/latest — get latest session
  const latestMatch = path.match(/^\/api\/tasks\/([^/]+)\/([^/]+)\/sessions\/latest$/)
  if (latestMatch && req.method === 'GET') {
    const slugErr = validateSlugs(latestMatch[1], latestMatch[2])
    if (slugErr) return jsonResponse({ error: slugErr }, 400)
    const session = await getLatestSession(latestMatch[1], latestMatch[2])
    if (!session) return jsonResponse(null)
    return jsonResponse(session)
  }

  // GET /api/tasks/:wsSlug/:cardId/sessions/:sessionId — get specific session
  const sessionMatch = path.match(/^\/api\/tasks\/([^/]+)\/([^/]+)\/sessions\/(session-\d+)$/)
  if (sessionMatch && req.method === 'GET') {
    const slugErr = validateSlugs(sessionMatch[1], sessionMatch[2])
    if (slugErr) return jsonResponse({ error: slugErr }, 400)
    const session = await getSession(sessionMatch[1], sessionMatch[2], sessionMatch[3])
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)
    return jsonResponse(session)
  }

  // GET /api/tasks/:wsSlug/:cardId — list files in task workspace
  const listMatch = path.match(/^\/api\/tasks\/([^/]+)\/([^/]+)$/)
  if (listMatch && req.method === 'GET') {
    const slugErr = validateSlugs(listMatch[1], listMatch[2])
    if (slugErr) return jsonResponse({ error: slugErr }, 400)
    const files = await TaskWorkspace.listFiles(listMatch[1], listMatch[2])
    const taskPath = TaskWorkspace.getPath(listMatch[1], listMatch[2])
    return jsonResponse({ taskPath, files })
  }

  // GET /api/tasks/:wsSlug/:cardId/:file — read file content
  const fileMatch = path.match(/^\/api\/tasks\/([^/]+)\/([^/]+)\/(.+)$/)
  if (fileMatch && req.method === 'GET') {
    const slugErr = validateSlugs(fileMatch[1], fileMatch[2])
    if (slugErr) return jsonResponse({ error: slugErr }, 400)
    const filename = sanitizeFilename(fileMatch[3])
    if (!filename) return jsonResponse({ error: 'Invalid filename' }, 400)

    const content = await TaskWorkspace.readFile(fileMatch[1], fileMatch[2], filename)
    if (content === null) return jsonResponse({ error: 'File not found' }, 404)
    return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
