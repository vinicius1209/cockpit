import { jsonResponse } from '../index'
import {
  getScheduledJobs,
  getJob,
  addScheduledJob,
  removeScheduledJob,
  toggleJob,
  runJobNow,
} from '../scheduler/scheduler'

export async function handleSchedulerRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /scheduler/jobs — list all jobs
  if (path === '/scheduler/jobs' && req.method === 'GET') {
    return jsonResponse(getScheduledJobs())
  }

  // POST /scheduler/jobs — create a new job
  if (path === '/scheduler/jobs' && req.method === 'POST') {
    const body = await req.json() as {
      projectPath: string
      projectName: string
      workspaceId: string
      agent?: string
      intervalHours: number
    }

    if (!body.projectPath || !body.projectName || !body.workspaceId || !body.intervalHours) {
      return jsonResponse({ error: 'Missing required fields' }, 400)
    }

    const job = addScheduledJob(body)
    return jsonResponse(job)
  }

  // DELETE /scheduler/jobs/:id
  const deleteMatch = path.match(/^\/scheduler\/jobs\/([^/]+)$/)
  if (deleteMatch && req.method === 'DELETE') {
    const removed = removeScheduledJob(deleteMatch[1])
    return jsonResponse({ removed })
  }

  // POST /scheduler/jobs/:id/toggle
  const toggleMatch = path.match(/^\/scheduler\/jobs\/([^/]+)\/toggle$/)
  if (toggleMatch && req.method === 'POST') {
    const body = await req.json() as { enabled: boolean }
    const job = toggleJob(toggleMatch[1], body.enabled)
    if (!job) return jsonResponse({ error: 'Job not found' }, 404)
    return jsonResponse(job)
  }

  // POST /scheduler/jobs/:id/run — run now
  const runMatch = path.match(/^\/scheduler\/jobs\/([^/]+)\/run$/)
  if (runMatch && req.method === 'POST') {
    const result = await runJobNow(runMatch[1])
    if (!result) return jsonResponse({ error: 'Job not found' }, 404)
    return jsonResponse(result)
  }

  // GET /scheduler/jobs/:id — get job details
  const getMatch = path.match(/^\/scheduler\/jobs\/([^/]+)$/)
  if (getMatch && req.method === 'GET') {
    const job = getJob(getMatch[1])
    if (!job) return jsonResponse({ error: 'Job not found' }, 404)
    return jsonResponse(job)
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
