import { jsonResponse } from '../http'
import { getDataStore, listDataStores } from '../persistence/data-stores'
import { validateStoreName } from '../validation'

export async function handleDataRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /api/data — list available stores
  if (path === '/api/data' && req.method === 'GET') {
    return jsonResponse({ stores: listDataStores() })
  }

  // GET /api/data/:store — load store data
  const getMatch = path.match(/^\/api\/data\/([^/]+)$/)
  if (getMatch && req.method === 'GET') {
    if (!validateStoreName(getMatch[1])) return jsonResponse({ error: `Invalid store name` }, 400)
    const store = getDataStore(getMatch[1])
    if (!store) return jsonResponse({ error: `Store "${getMatch[1]}" not found` }, 404)
    return jsonResponse(store.get())
  }

  // POST /api/data/:store — save store data (full replace)
  const postMatch = path.match(/^\/api\/data\/([^/]+)$/)
  if (postMatch && req.method === 'POST') {
    if (!validateStoreName(postMatch[1])) return jsonResponse({ error: `Invalid store name` }, 400)
    const store = getDataStore(postMatch[1])
    if (!store) return jsonResponse({ error: `Store "${postMatch[1]}" not found` }, 404)

    try {
      const body = await req.json()
      await store.set(body)
      return jsonResponse({ ok: true })
    } catch (err) {
      return jsonResponse({ error: `Failed to save: ${err instanceof Error ? err.message : 'unknown'}` }, 500)
    }
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
