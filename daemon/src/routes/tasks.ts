import { jsonResponse } from '../index'
import { TaskWorkspace } from '../tasks/task-workspace'

export async function handleTaskRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /api/tasks/sync — sync card data to task workspace files
  if (path === '/api/tasks/sync' && req.method === 'POST') {
    try {
      const body = await req.json()
      if (!body.workspaceSlug || !body.cardId) {
        return jsonResponse({ error: 'Missing workspaceSlug or cardId' }, 400)
      }
      const taskPath = await TaskWorkspace.sync(body)
      return jsonResponse({ ok: true, taskPath })
    } catch (err) {
      return jsonResponse({ error: `Sync failed: ${err instanceof Error ? err.message : 'unknown'}` }, 500)
    }
  }

  // GET /api/tasks/:wsSlug/:cardId — list files in task workspace
  const listMatch = path.match(/^\/api\/tasks\/([^/]+)\/([^/]+)$/)
  if (listMatch && req.method === 'GET') {
    const files = await TaskWorkspace.listFiles(listMatch[1], listMatch[2])
    const taskPath = TaskWorkspace.getPath(listMatch[1], listMatch[2])
    return jsonResponse({ taskPath, files })
  }

  // GET /api/tasks/:wsSlug/:cardId/:file — read file content
  const fileMatch = path.match(/^\/api\/tasks\/([^/]+)\/([^/]+)\/(.+)$/)
  if (fileMatch && req.method === 'GET') {
    const content = await TaskWorkspace.readFile(fileMatch[1], fileMatch[2], fileMatch[3])
    if (content === null) return jsonResponse({ error: 'File not found' }, 404)
    return new Response(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
