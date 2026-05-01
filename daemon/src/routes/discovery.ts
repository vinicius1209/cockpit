import { jsonResponse } from '../index'
import { runDiscovery } from '../discovery/discovery-engine'
import { diffScan, getScanHistory, linkFindingToCard } from '../discovery/scan-differ'

export async function handleDiscoveryRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /discovery/run — run discovery with diff tracking
  if (path === '/discovery/run' && req.method === 'POST') {
    const body = await req.json() as { projectPath: string; agent?: string }
    if (!body.projectPath) {
      return jsonResponse({ error: 'Missing "projectPath"' }, 400)
    }

    try {
      const result = await runDiscovery(body.projectPath, body.agent)
      const diff = diffScan(body.projectPath, result.cards)

      return jsonResponse({
        ...result,
        diff: {
          newCount: diff.newFindings.length,
          existingCount: diff.existingFindings.length,
          resolvedCount: diff.resolvedFindings.length,
          findings: diff.findings.map((f) => ({
            ...f.card,
            fingerprint: f.fingerprint,
            status: f.status,
            firstSeen: f.firstSeen,
            linkedCardId: f.linkedCardId,
          })),
          resolved: diff.resolvedFindings.map((f) => ({
            ...f.card,
            fingerprint: f.fingerprint,
            firstSeen: f.firstSeen,
            resolvedAt: f.lastSeen,
          })),
        },
      })
    } catch (err) {
      return jsonResponse({ error: `Discovery failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  // GET /discovery/history?projectPath=... — get scan history
  if (path === '/discovery/history' && req.method === 'GET') {
    const projectPath = url.searchParams.get('projectPath')
    if (!projectPath) {
      return jsonResponse({ error: 'Missing "projectPath" query param' }, 400)
    }

    return jsonResponse(getScanHistory(projectPath))
  }

  // POST /discovery/link — link finding to card
  if (path === '/discovery/link' && req.method === 'POST') {
    const body = await req.json() as { projectPath: string; fingerprint: string; cardId: string }
    if (!body.projectPath || !body.fingerprint || !body.cardId) {
      return jsonResponse({ error: 'Missing required fields' }, 400)
    }

    linkFindingToCard(body.projectPath, body.fingerprint, body.cardId)
    return jsonResponse({ linked: true })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
