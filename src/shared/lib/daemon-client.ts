import type { ScanResult, InstalledAgent, DiscoveryResult, JobSummary } from '@/entities/card/project-types'
import { DAEMON_URL } from '@/shared/lib/constants'

// Mirror of AgentSession in daemon/src/tasks/session-manager.ts
export interface AgentSessionDto {
  id: string
  workspaceSlug: string
  cardId: string
  action: 'spec' | 'implementation' | 'discovery' | 'chat'
  agent: string
  model: string | null
  phase: 'analyzing' | 'branching' | 'implementing' | 'creating-pr' | 'done' | 'error' | 'running'
  startedAt: string
  completedAt: string | null
  duration: number | null
  exitCode: number | null
  chunks: string[]
  error: string | null
  attempt: number
  branch: string | null
  feedback: string | null
}

async function daemonFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${DAEMON_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Daemon error ${res.status}`)
  }
  return res.json()
}

export const daemonClient = {
  health: () => daemonFetch<{ status: string; version: string }>('/health'),

  scanProject: (path: string) =>
    daemonFetch<ScanResult>('/projects/scan', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  getAvailableAgents: () =>
    daemonFetch<InstalledAgent[]>('/agents/available'),

  runDiscovery: (projectPath: string, agent?: string, model?: string) =>
    daemonFetch<DiscoveryResult>('/discovery/run', {
      method: 'POST',
      body: JSON.stringify({ projectPath, agent, model }),
    }),

  executeAgent: (agent: string, prompt: string, projectPath?: string) =>
    daemonFetch<{ agent: string; output: string; exitCode: number; duration: number }>('/agents/execute', {
      method: 'POST',
      body: JSON.stringify({ agent, prompt, projectPath }),
    }),

  bootstrapProject: (path: string, force = false) =>
    daemonFetch<{ project: string; path: string; filesCreated: string[]; filesSkipped: string[] }>('/projects/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ path, force }),
    }),

  // N7 — exporta agentes do workspace para <project>/.cockpit/config.json
  syncProjectConfig: (path: string, agents: unknown[], workspaceName?: string) =>
    daemonFetch<{ ok: boolean; configPath: string; agentsExported: number; syncedAt: string }>('/projects/sync-config', {
      method: 'POST',
      body: JSON.stringify({ path, agents, workspaceName }),
    }),

  linkFinding: (projectPath: string, fingerprint: string, cardId: string) =>
    daemonFetch<{ linked: boolean }>('/discovery/link', {
      method: 'POST',
      body: JSON.stringify({ projectPath, fingerprint, cardId }),
    }),

  startDiscovery: (projectPath: string, agent?: string, model?: string) =>
    daemonFetch<{ jobId: string; status: string }>('/discovery/start', {
      method: 'POST',
      body: JSON.stringify({ projectPath, agent, model }),
    }),

  getDiscoveryJob: (jobId: string) =>
    daemonFetch<Record<string, unknown>>(`/discovery/jobs/${jobId}`),

  listDiscoveryJobs: (projectPath?: string, limit = 10) => {
    const params = new URLSearchParams()
    if (projectPath) params.set('projectPath', projectPath)
    params.set('limit', String(limit))
    return daemonFetch<JobSummary[]>(`/discovery/jobs?${params}`)
  },

  syncTaskWorkspace: (data: {
    workspaceSlug: string; cardId: string;
    title?: string; type?: string; spec?: string;
    interviewNotes?: string; interviewMessages?: Record<string, unknown>[];
    discoveryOutput?: string;
  }) =>
    daemonFetch<{ ok: boolean; taskPath: string }>('/api/tasks/sync', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTaskFiles: (wsSlug: string, cardId: string) =>
    daemonFetch<{ taskPath: string; files: string[] }>(`/api/tasks/${wsSlug}/${cardId}`),

  getTaskFile: async (wsSlug: string, cardId: string, filename: string): Promise<string | null> => {
    try {
      const res = await fetch(`${DAEMON_URL}/api/tasks/${wsSlug}/${cardId}/${filename}`)
      if (!res.ok) return null
      return await res.text()
    } catch {
      return null
    }
  },

  // Metrics
  getMetrics: () =>
    daemonFetch<Record<string, unknown>>('/api/metrics'),

  // Sessions (legacy implement-only)
  getSessions: (wsSlug: string, cardId: string) =>
    daemonFetch<Record<string, unknown>[]>(`/api/tasks/${wsSlug}/${cardId}/sessions`),

  getLatestSession: (wsSlug: string, cardId: string) =>
    daemonFetch<Record<string, unknown> | null>(`/api/tasks/${wsSlug}/${cardId}/sessions/latest`),

  // Generic agent sessions (N2/N3)
  listRunningSessions: () =>
    daemonFetch<{ sessions: AgentSessionDto[] }>('/agents/sessions/running'),

  getAgentSession: (sessionId: string) =>
    daemonFetch<{ session: AgentSessionDto | null }>(`/agents/sessions/${sessionId}`),

  getLatestAgentSession: (wsSlug: string, cardId: string, action?: string) => {
    const q = action ? `?action=${encodeURIComponent(action)}` : ''
    return daemonFetch<{ session: AgentSessionDto | null }>(`/agents/sessions/${wsSlug}/${cardId}/latest${q}`)
  },

  // Git flow
  analyzeGitFlow: (projectPath: string) =>
    daemonFetch<Record<string, unknown>>('/git/analyze', {
      method: 'POST',
      body: JSON.stringify({ projectPath }),
    }),

  getGitProfile: (projectPath: string) =>
    daemonFetch<Record<string, unknown>>(`/git/profile?path=${encodeURIComponent(projectPath)}`),

  getGhAccounts: () =>
    daemonFetch<{ user: string; active: boolean; host: string }[]>('/git/accounts'),

  switchGhAccount: (user: string) =>
    daemonFetch<{ switched: boolean }>('/git/switch-account', {
      method: 'POST',
      body: JSON.stringify({ user }),
    }),
}
