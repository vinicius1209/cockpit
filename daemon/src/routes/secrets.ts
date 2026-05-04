import { jsonResponse } from '../http'
import { getSecret, setSecret, removeSecret, listSecrets } from '../persistence/secrets-store'

const VALID_PROVIDERS = ['claude', 'openai', 'gemini']

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
    if (!VALID_PROVIDERS.includes(provider)) return jsonResponse({ error: 'Invalid provider' }, 400)
    return jsonResponse({ provider, configured: !!getSecret(provider) })
  }

  // POST /secrets/keys/:provider — save key
  const postMatch = path.match(/^\/secrets\/keys\/([^/]+)$/)
  if (postMatch && req.method === 'POST') {
    const provider = postMatch[1]
    if (!VALID_PROVIDERS.includes(provider)) return jsonResponse({ error: 'Invalid provider' }, 400)
    const body = await req.json() as { key: string }
    if (!body.key || typeof body.key !== 'string') {
      return jsonResponse({ error: 'Missing "key" field' }, 400)
    }
    if (body.key.length > 500) {
      return jsonResponse({ error: 'Key too long (max 500 chars)' }, 400)
    }
    await setSecret(provider, body.key)
    return jsonResponse({ saved: true })
  }

  // DELETE /secrets/keys/:provider — remove key
  const deleteMatch = path.match(/^\/secrets\/keys\/([^/]+)$/)
  if (deleteMatch && req.method === 'DELETE') {
    const provider = deleteMatch[1]
    if (!VALID_PROVIDERS.includes(provider)) return jsonResponse({ error: 'Invalid provider' }, 400)
    await removeSecret(provider)
    return jsonResponse({ removed: true })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
