import { initDB } from './db'
import { initSchedulerStore } from '../scheduler/scheduler'

export async function initPersistence(): Promise<void> {
  console.log('[persistence] Initializing...')

  // SQLite handles all stores now
  await initDB()

  // Scheduler needs to restore timers after DB is ready
  await initSchedulerStore()

  console.log('[persistence] Ready')
}
