import { jsonResponse } from '../index'
import { getSecret, setSecret, removeSecret, listSecrets } from '../persistence/secrets-store'

export async function handleSecretsRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /secrets/keys — list all providers
  if (path === '/secrets/keys' && req.method === 'GET') {
    return jsonResponse(listSecrets())
  }

  // GET /secrets/keys/:provider — check if configured
  const getMatch = path.match(/^\/secrets\/keys\/([^/]+)$/)
  if (getMatch && req.method === 'GET') {
    const provider = getMatch[1]
    return jsonResponse({ provider, configured: !!getSecret(provider) })
  }

  // POST /secrets/keys/:provider — save key
  const postMatch = path.match(/^\/secrets\/keys\/([^/]+)$/)
  if (postMatch && req.method === 'POST') {
    const provider = postMatch[1]
    const body = await req.json() as { key: string }
    if (!body.key) {
      return jsonResponse({ error: 'Missing "key" field' }, 400)
    }
    await setSecret(provider, body.key)
    return jsonResponse({ saved: true })
  }

  // DELETE /secrets/keys/:provider — remove key
  const deleteMatch = path.match(/^\/secrets\/keys\/([^/]+)$/)
  if (deleteMatch && req.method === 'DELETE') {
    const provider = deleteMatch[1]
    await removeSecret(provider)
    return jsonResponse({ removed: true })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
