import { runDiscovery, type DiscoveryResult } from '../discovery/discovery-engine'

export interface ScheduledJob {
  id: string
  projectPath: string
  projectName: string
  workspaceId: string
  agent: string | undefined
  intervalMs: number
  enabled: boolean
  lastRun: string | null
  lastResult: DiscoveryResult | null
  nextRun: string
}

const jobs = new Map<string, ScheduledJob>()
const timers = new Map<string, Timer>()

export function getScheduledJobs(): ScheduledJob[] {
  return Array.from(jobs.values())
}

export function getJob(id: string): ScheduledJob | undefined {
  return jobs.get(id)
}

export function addScheduledJob(config: {
  projectPath: string
  projectName: string
  workspaceId: string
  agent?: string
  intervalHours: number
}): ScheduledJob {
  const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
  const intervalMs = config.intervalHours * 60 * 60 * 1000

  const job: ScheduledJob = {
    id,
    projectPath: config.projectPath,
    projectName: config.projectName,
    workspaceId: config.workspaceId,
    agent: config.agent,
    intervalMs,
    enabled: true,
    lastRun: null,
    lastResult: null,
    nextRun: new Date(Date.now() + intervalMs).toISOString(),
  }

  jobs.set(id, job)
  startJobTimer(job)

  console.log(`[scheduler] Job "${job.projectName}" scheduled every ${config.intervalHours}h`)
  return job
}

export function removeScheduledJob(id: string): boolean {
  const timer = timers.get(id)
  if (timer) {
    clearInterval(timer)
    timers.delete(id)
  }
  return jobs.delete(id)
}

export function toggleJob(id: string, enabled: boolean): ScheduledJob | undefined {
  const job = jobs.get(id)
  if (!job) return undefined

  job.enabled = enabled

  if (enabled) {
    startJobTimer(job)
  } else {
    const timer = timers.get(id)
    if (timer) {
      clearInterval(timer)
      timers.delete(id)
    }
  }

  return job
}

export async function runJobNow(id: string): Promise<DiscoveryResult | null> {
  const job = jobs.get(id)
  if (!job) return null

  return executeJob(job)
}

async function executeJob(job: ScheduledJob): Promise<DiscoveryResult> {
  console.log(`[scheduler] Running discovery for "${job.projectName}"...`)

  const result = await runDiscovery(job.projectPath, job.agent)

  job.lastRun = new Date().toISOString()
  job.lastResult = result
  job.nextRun = new Date(Date.now() + job.intervalMs).toISOString()

  console.log(`[scheduler] Discovery complete: ${result.cards.length} cards found for "${job.projectName}"`)

  return result
}

function startJobTimer(job: ScheduledJob) {
  // Clear existing timer
  const existing = timers.get(job.id)
  if (existing) clearInterval(existing)

  const timer = setInterval(async () => {
    if (!job.enabled) return
    try {
      await executeJob(job)
    } catch (err) {
      console.error(`[scheduler] Error running job "${job.projectName}":`, err)
    }
  }, job.intervalMs)

  timers.set(job.id, timer)
}
