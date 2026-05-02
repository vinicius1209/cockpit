import { jsonResponse } from '../index'
import { runDiscovery } from '../discovery/discovery-engine'
import { diffScan, getScanHistory, linkFindingToCard } from '../discovery/scan-differ'
import { createJob, executeJobAsync, getJob, subscribeToJob } from '../discovery/job-queue'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function handleDiscoveryRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /discovery/run — synchronous (fast-path, scanner only)
  if (path === '/discovery/run' && req.method === 'POST') {
    const body = await req.json() as { projectPath: string; agent?: string; model?: string }
    if (!body.projectPath) {
      return jsonResponse({ error: 'Missing "projectPath"' }, 400)
    }

    try {
      const result = await runDiscovery(body.projectPath, body.agent, body.model)
      const diff = diffScan(body.projectPath, result.cards)

      return jsonResponse({
        ...result,
        diff: {
          newCount: diff.newFindings.length,
          baselineCount: diff.baselineFindings.length,
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

  // POST /discovery/start — async job (returns immediately)
  if (path === '/discovery/start' && req.method === 'POST') {
    const body = await req.json() as { projectPath: string; agent?: string; model?: string }
    if (!body.projectPath) {
      return jsonResponse({ error: 'Missing "projectPath"' }, 400)
    }

    const job = createJob(body.projectPath, body.agent, body.model)

    // Fire and forget
    executeJobAsync(job.id).catch((err) => {
      console.error(`[discovery] Job ${job.id} failed:`, err)
    })

    return jsonResponse({ jobId: job.id, status: job.status })
  }

  // GET /discovery/stream/:jobId — SSE stream
  const streamMatch = path.match(/^\/discovery\/stream\/([^/]+)$/)
  if (streamMatch && req.method === 'GET') {
    const jobId = streamMatch[1]
    const job = getJob(jobId)
    if (!job) return jsonResponse({ error: 'Job not found' }, 404)

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        // Catch-up: send existing progress
        for (const p of job.progress) {
          send(p)
        }

        // If already done, send result and close
        if (job.status === 'completed' || job.status === 'failed') {
          send({
            phase: job.status,
            message: job.status === 'completed' ? 'Concluido' : job.error,
            result: job.result,
            error: job.error,
          })
          controller.close()
          return
        }

        // Subscribe to live updates
        const unsubscribe = subscribeToJob(jobId, (event) => {
          send(event)

          if (event.phase === 'completed' || event.phase === 'failed') {
            send({
              phase: event.phase,
              message: event.message,
              result: job.result,
              error: job.error,
            })
            unsubscribe()
            controller.close()
          }
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders(),
      },
    })
  }

  // GET /discovery/jobs/:jobId — fetch job result
  const jobMatch = path.match(/^\/discovery\/jobs\/([^/]+)$/)
  if (jobMatch && req.method === 'GET') {
    const job = getJob(jobMatch[1])
    if (!job) return jsonResponse({ error: 'Job not found' }, 404)
    return jsonResponse(job)
  }

  // GET /discovery/history
  if (path === '/discovery/history' && req.method === 'GET') {
    const projectPath = url.searchParams.get('projectPath')
    if (!projectPath) {
      return jsonResponse({ error: 'Missing "projectPath" query param' }, 400)
    }
    return jsonResponse(getScanHistory(projectPath))
  }

  // POST /discovery/link
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
