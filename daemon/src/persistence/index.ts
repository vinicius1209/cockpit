import { initSecrets } from './secrets-store'
import { initDataStores } from './data-stores'
import { initScanHistory } from '../discovery/scan-differ'
import { initJobStore } from '../discovery/job-queue'
import { initSchedulerStore } from '../scheduler/scheduler'
import { initGitProfiles } from '../git/git-flow-profile'

export async function initPersistence(): Promise<void> {
  console.log('[persistence] Initializing...')
  await Promise.all([
    initSecrets(),
    initDataStores(),
    initScanHistory(),
    initJobStore(),
    initSchedulerStore(),
    initGitProfiles(),
  ])
  console.log('[persistence] Ready')
}
