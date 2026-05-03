import { DaemonFileStore } from './file-store'

const stores: Record<string, DaemonFileStore<unknown>> = {
  cards: new DaemonFileStore('cockpit-cards.json', {}),
  workspaces: new DaemonFileStore('cockpit-workspaces.json', {}),
  agents: new DaemonFileStore('cockpit-agents.json', {}),
  docs: new DaemonFileStore('cockpit-docs.json', {}),
  projects: new DaemonFileStore('cockpit-projects.json', {}),
}

export async function initDataStores(): Promise<void> {
  for (const [name, store] of Object.entries(stores)) {
    await store.init()
    console.log(`[data-store] ${name} loaded`)
  }
}

export function getDataStore(name: string): DaemonFileStore<unknown> | undefined {
  return stores[name]
}

export function listDataStores(): string[] {
  return Object.keys(stores)
}
