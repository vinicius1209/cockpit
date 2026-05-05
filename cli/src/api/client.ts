import { getDaemonUrl } from '../config/daemon'

class DaemonError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'DaemonError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getDaemonUrl()}${path}`
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new DaemonError(res.status, body.error || res.statusText)
  }
  return res.json() as Promise<T>
}

// Direct fetch (sem JSON parse) — usado por SSE streams
export async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${getDaemonUrl()}${path}`, init)
}

// ── Domain types (mirror do daemon) ──

export interface Workspace {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string | null
  created_at: string
}

export interface BoardColumn {
  id: string
  workspace_id: string
  name: string
  slug: string
  position: number
  color: string | null
}

export interface Card {
  id: string
  workspace_id: string
  column_id: string
  project_id: string | null
  title: string
  description: string | null
  type: string
  priority: string
  position: number
  assignee: string | null
  due_date: string | null
  spec_status: string | null
  spec_content: string | null
  interview_notes: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  labels?: Array<{ label_id: string; label?: { name: string; color: string } }>
}

export interface Project {
  id: string
  workspace_id: string
  name: string
  path: string
  auto_pr: boolean
  last_scan_at: string | null
}

export interface InstalledAgent {
  name: string
  command: string
  path: string
  version: string | null
  models: Array<{ id: string; label: string; cost: string }>
  defaultModel: string | null
}

export interface AgentSession {
  id: string
  workspaceSlug: string
  cardId: string
  action: 'spec' | 'implementation' | 'discovery' | 'chat'
  agent: string
  model: string | null
  phase: string
  startedAt: string
  completedAt: string | null
  duration: number | null
  exitCode: number | null
  chunks: string[]
  error: string | null
}

// ── API ──

export const api = {
  health: () => request<{ status: string; version: string }>('/health'),

  // Data stores (KV via persist adapter)
  getStore: <T = unknown>(name: string) => request<T>(`/api/data/${name}`),

  // POST sobrescreve TODA a tabela do store (matching Zustand persist behavior).
  // Usa-se: ler envelope inteiro → mutar state → escrever de volta.
  setStore: <T = unknown>(name: string, payload: T) =>
    request<{ ok: boolean }>(`/api/data/${name}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Tasks workspace
  getTaskFiles: (wsSlug: string, cardId: string) =>
    request<{ taskPath: string; files: string[] }>(`/api/tasks/${wsSlug}/${cardId}`),

  // Sessions (N2/N3)
  listRunningSessions: () => request<{ sessions: AgentSession[] }>('/agents/sessions/running'),
  getSession: (id: string) => request<{ session: AgentSession | null }>(`/agents/sessions/${id}`),
  getLatestSession: (wsSlug: string, cardId: string, action?: string) => {
    const q = action ? `?action=${encodeURIComponent(action)}` : ''
    return request<{ session: AgentSession | null }>(`/agents/sessions/${wsSlug}/${cardId}/latest${q}`)
  },

  // Agents
  getAvailableAgents: () => request<InstalledAgent[]>('/agents/available'),

  // Metrics
  getMetrics: () => request<Record<string, unknown>>('/api/metrics'),
}

export { DaemonError }
