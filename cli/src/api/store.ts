import { api } from './client'
import type { Card, Workspace, BoardColumn, Project } from './client'

// O daemon armazena os Zustand stores em /api/data/<name> com payload
// { state: { ...partializedState }, version: N, _ts }. Aqui desempacotamos.

interface PersistEnvelope<S> {
  state?: S
  version?: number
  _ts?: number
}

async function readStore<T>(name: string, key: keyof T): Promise<T[keyof T]> {
  const env = await api.getStore<PersistEnvelope<T>>(name)
  if (!env || !env.state) return {} as T[keyof T]
  return (env.state as T)[key]
}

interface CardStoreState {
  cards: Card[]
  columns: Record<string, BoardColumn[]>
  labels: Record<string, Array<{ id: string; name: string; color: string }>>
}

interface WorkspaceStoreState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}

interface ProjectStoreState {
  projects: Record<string, Project[]>
}

export async function loadWorkspaces(): Promise<Workspace[]> {
  const ws = await readStore<WorkspaceStoreState, 'workspaces'>('workspaces', 'workspaces')
  return Array.isArray(ws) ? ws : []
}

export async function loadActiveWorkspaceId(): Promise<string | null> {
  return readStore<WorkspaceStoreState, 'activeWorkspaceId'>('workspaces', 'activeWorkspaceId')
}

export async function loadCards(): Promise<Card[]> {
  const cards = await readStore<CardStoreState, 'cards'>('cards', 'cards')
  return Array.isArray(cards) ? cards : []
}

export async function loadColumns(): Promise<Record<string, BoardColumn[]>> {
  const cols = await readStore<CardStoreState, 'columns'>('cards', 'columns')
  return cols && typeof cols === 'object' ? cols : {}
}

export async function loadProjects(): Promise<Project[]> {
  const all = await readStore<ProjectStoreState, 'projects'>('projects', 'projects')
  if (!all || typeof all !== 'object') return []
  return Object.values(all).flat()
}

// Compose: tudo de uma vez
export async function loadAll() {
  const [workspaces, cards, columns, projects, activeWsId] = await Promise.all([
    loadWorkspaces(),
    loadCards(),
    loadColumns(),
    loadProjects(),
    loadActiveWorkspaceId(),
  ])
  return { workspaces, cards, columns, projects, activeWsId }
}
