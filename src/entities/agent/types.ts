export const AGENT_ROLES = ['analyzer', 'spec-writer', 'interviewer', 'implementer', 'reviewer', 'custom'] as const
export type AgentRole = typeof AGENT_ROLES[number]

export const AGENT_PROVIDERS = ['claude', 'openai', 'gemini', 'custom'] as const
export type AgentProvider = typeof AGENT_PROVIDERS[number]

export interface AgentConfig {
  id: string
  workspace_id: string
  name: string
  role: AgentRole
  provider: AgentProvider
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
  enabled: boolean
  created_at: string
}

export type AgentConfigInsert = Omit<AgentConfig, 'id' | 'created_at'>

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface AgentRun {
  id: string
  agent_id: string
  card_id: string | null
  workspace_id: string
  status: 'running' | 'completed' | 'error' | 'cancelled'
  messages: AgentMessage[]
  result: string | null
  error: string | null
  started_at: string
  finished_at: string | null
}

export type AgentRunInsert = Omit<AgentRun, 'id' | 'started_at' | 'finished_at'>
