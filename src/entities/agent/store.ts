import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentConfig, AgentRun, AgentMessage } from './types'
import { AGENT_PRESETS } from './presets'

interface AgentState {
  configs: Record<string, AgentConfig[]>
  runs: AgentRun[]
  apiKeys: Record<string, string>

  // Config management
  getWorkspaceAgents: (workspaceId: string) => AgentConfig[]
  initWorkspaceAgents: (workspaceId: string) => void
  addAgentConfig: (config: Omit<AgentConfig, 'id' | 'created_at'>) => string
  updateAgentConfig: (id: string, workspaceId: string, data: Partial<AgentConfig>) => void
  deleteAgentConfig: (id: string, workspaceId: string) => void

  // Run management
  createRun: (agentId: string, cardId: string | null, workspaceId: string) => string
  addMessage: (runId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>) => void
  updateRunStatus: (runId: string, status: AgentRun['status'], result?: string, error?: string) => void
  getCardRuns: (cardId: string) => AgentRun[]
  getRun: (runId: string) => AgentRun | undefined

  // API key management
  setApiKey: (provider: string, key: string) => void
  getApiKey: (provider: string) => string | undefined
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      configs: {},
      runs: [],
      apiKeys: {},

      getWorkspaceAgents: (workspaceId) => {
        const configs = get().configs[workspaceId]
        if (!configs || configs.length === 0) {
          get().initWorkspaceAgents(workspaceId)
          return get().configs[workspaceId] || []
        }
        return configs
      },

      initWorkspaceAgents: (workspaceId) => {
        const existing = get().configs[workspaceId]
        if (existing && existing.length > 0) return

        const agents: AgentConfig[] = AGENT_PRESETS.map((preset, i) => ({
          ...preset,
          id: `agent-${workspaceId}-${preset.role}-${i}`,
          workspace_id: workspaceId,
          enabled: true,
          created_at: new Date().toISOString(),
        }))

        set((state) => ({
          configs: { ...state.configs, [workspaceId]: agents },
        }))
      },

      addAgentConfig: (config) => {
        const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        const agentConfig: AgentConfig = {
          ...config,
          id,
          created_at: new Date().toISOString(),
        }
        set((state) => ({
          configs: {
            ...state.configs,
            [config.workspace_id]: [...(state.configs[config.workspace_id] || []), agentConfig],
          },
        }))
        return id
      },

      updateAgentConfig: (id, workspaceId, data) => {
        set((state) => ({
          configs: {
            ...state.configs,
            [workspaceId]: (state.configs[workspaceId] || []).map((c) =>
              c.id === id ? { ...c, ...data } : c,
            ),
          },
        }))
      },

      deleteAgentConfig: (id, workspaceId) => {
        set((state) => ({
          configs: {
            ...state.configs,
            [workspaceId]: (state.configs[workspaceId] || []).filter((c) => c.id !== id),
          },
        }))
      },

      createRun: (agentId, cardId, workspaceId) => {
        const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        const run: AgentRun = {
          id,
          agent_id: agentId,
          card_id: cardId,
          workspace_id: workspaceId,
          status: 'running',
          messages: [],
          result: null,
          error: null,
          started_at: new Date().toISOString(),
          finished_at: null,
        }
        set((state) => ({ runs: [run, ...state.runs] }))
        return id
      },

      addMessage: (runId, message) => {
        const msg: AgentMessage = {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: new Date().toISOString(),
        }
        set((state) => ({
          runs: state.runs.map((r) =>
            r.id === runId ? { ...r, messages: [...r.messages, msg] } : r,
          ),
        }))
      },

      updateRunStatus: (runId, status, result, error) => {
        set((state) => ({
          runs: state.runs.map((r) =>
            r.id === runId
              ? { ...r, status, result: result ?? r.result, error: error ?? r.error, finished_at: new Date().toISOString() }
              : r,
          ),
        }))
      },

      getCardRuns: (cardId) => {
        return get().runs.filter((r) => r.card_id === cardId).sort((a, b) => b.started_at.localeCompare(a.started_at))
      },

      getRun: (runId) => {
        return get().runs.find((r) => r.id === runId)
      },

      setApiKey: (provider, key) => {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        }))
      },

      getApiKey: (provider) => {
        return get().apiKeys[provider]
      },
    }),
    { name: 'cockpit-agents' },
  ),
)
