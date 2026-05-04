import type { ScanResult, InstalledAgent, DiscoveryResult, JobSummary } from '@/entities/card/project-types'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL || 'http://localhost:4800'

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
}
