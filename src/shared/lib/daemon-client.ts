import type { ScanResult, InstalledAgent, DiscoveryResult } from '@/entities/card/project-types'

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

  runDiscovery: (projectPath: string, agent?: string) =>
    daemonFetch<DiscoveryResult>('/discovery/run', {
      method: 'POST',
      body: JSON.stringify({ projectPath, agent }),
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

  startDiscovery: (projectPath: string, agent?: string) =>
    daemonFetch<{ jobId: string; status: string }>('/discovery/start', {
      method: 'POST',
      body: JSON.stringify({ projectPath, agent }),
    }),

  getDiscoveryJob: (jobId: string) =>
    daemonFetch<Record<string, unknown>>(`/discovery/jobs/${jobId}`),
}
