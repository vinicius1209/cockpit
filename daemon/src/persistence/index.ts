import { initSecrets } from './secrets-store'
import { initScanHistory } from '../discovery/scan-differ'
import { initJobStore } from '../discovery/job-queue'
import { initSchedulerStore } from '../scheduler/scheduler'

export async function initPersistence(): Promise<void> {
  console.log('[persistence] Initializing...')
  await Promise.all([
    initSecrets(),
    initScanHistory(),
    initJobStore(),
    initSchedulerStore(),
  ])
  console.log('[persistence] Ready')
}
