import { runDiscovery, type DiscoveryResult } from '../discovery/discovery-engine'
import { DaemonFileStore } from '../persistence/file-store'

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

const schedFileStore = new DaemonFileStore<Record<string, ScheduledJob>>('scheduled-jobs.json', {})
const timers = new Map<string, Timer>()

export async function initSchedulerStore(): Promise<void> {
  await schedFileStore.init()
  // Restore timers for enabled jobs
  const jobs = schedFileStore.get()
  for (const job of Object.values(jobs)) {
    if (job.enabled) {
      startJobTimer(job)
      console.log(`[scheduler] Restored job "${job.projectName}" (every ${Math.round(job.intervalMs / 3600000)}h)`)
    }
  }
}

function getJobMap(): Record<string, ScheduledJob> {
  return schedFileStore.get()
}

export function getScheduledJobs(): ScheduledJob[] {
  return Object.values(getJobMap())
}

export function getJob(id: string): ScheduledJob | undefined {
  return getJobMap()[id]
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

  const map = getJobMap()
  map[id] = job
  schedFileStore.set(map)
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
  const map = getJobMap()
  const existed = !!map[id]
  delete map[id]
  schedFileStore.set(map)
  return existed
}

export function toggleJob(id: string, enabled: boolean): ScheduledJob | undefined {
  const map = getJobMap()
  const job = map[id]
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

  schedFileStore.set(map)
  return job
}

export async function runJobNow(id: string): Promise<DiscoveryResult | null> {
  const job = getJobMap()[id]
  if (!job) return null
  return executeJob(job)
}

async function executeJob(job: ScheduledJob): Promise<DiscoveryResult> {
  console.log(`[scheduler] Running discovery for "${job.projectName}"...`)

  const result = await runDiscovery(job.projectPath, job.agent)

  job.lastRun = new Date().toISOString()
  job.lastResult = result
  job.nextRun = new Date(Date.now() + job.intervalMs).toISOString()

  schedFileStore.set(getJobMap())

  console.log(`[scheduler] Discovery complete: ${result.cards.length} cards found for "${job.projectName}"`)

  return result
}

function startJobTimer(job: ScheduledJob) {
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
