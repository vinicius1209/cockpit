import { jsonResponse } from '../http'
import { getDataStore, listDataStores } from '../persistence/data-stores'
import { readStore, writeStoreIfVersion } from '../persistence/atomic-store'
import { validateStoreName } from '../validation'

export async function handleDataRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /api/data — list available stores
  if (path === '/api/data' && req.method === 'GET') {
    return jsonResponse({ stores: listDataStores() })
  }

  // GET /api/data/:store — load store data + version atual.
  // Retorna { state: ..., version: N, _ts: ... }. Cliente preserva o version
  // recebido pra usar no proximo POST (optimistic locking).
  const getMatch = path.match(/^\/api\/data\/([^/]+)$/)
  if (getMatch && req.method === 'GET') {
    if (!validateStoreName(getMatch[1])) return jsonResponse({ error: `Invalid store name` }, 400)
    const store = getDataStore(getMatch[1])
    if (!store) return jsonResponse({ error: `Store "${getMatch[1]}" not found` }, 404)
    const snap = readStore(getMatch[1])
    const data = snap?.data ?? store.get()
    const version = snap?.version ?? 0
    // Backward compat: data ja tem `version` interno em alguns stores.
    // Sobrescreve com a versao do DB pra ter source of truth unica.
    return jsonResponse({ ...(data as Record<string, unknown>), version })
  }

  // POST /api/data/:store — save store data com optimistic locking.
  // Body pode ter `version` (do GET anterior). Daemon checa current vs
  // expected. Mismatch → 409 com `{ error: 'version_conflict', current }`.
  // Cliente refetch + retry.
  //
  // Modo legado: se body NAO tem version → force-write (compat com clientes
  // antigos). Migrar gradualmente pra always-versioned.
  const postMatch = path.match(/^\/api\/data\/([^/]+)$/)
  if (postMatch && req.method === 'POST') {
    if (!validateStoreName(postMatch[1])) return jsonResponse({ error: `Invalid store name` }, 400)
    const store = getDataStore(postMatch[1])
    if (!store) return jsonResponse({ error: `Store "${postMatch[1]}" not found` }, 404)

    try {
      const body = await req.json() as Record<string, unknown>
      const expectedVersion = typeof body.version === 'number' ? body.version : -1

      // Strip version do payload — ela e metadata da response, nao parte do state
      const { version: _omit, ...stateOnly } = body
      void _omit

      const result = writeStoreIfVersion(postMatch[1], stateOnly, expectedVersion)
      if (!result.ok) {
        return jsonResponse({
          error: 'version_conflict',
          message: 'store foi modificado por outro cliente entre seu GET e POST. Refetch + retry.',
          current_version: result.current.version,
        }, 409)
      }
      return jsonResponse({ ok: true, version: result.version })
    } catch (err) {
      return jsonResponse({ error: `Failed to save: ${err instanceof Error ? err.message : 'unknown'}` }, 500)
    }
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
