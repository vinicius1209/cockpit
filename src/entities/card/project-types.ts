export interface Project {
  id: string
  workspace_id: string
  name: string
  path: string
  agent_preference: string | null
  auto_scan: boolean
  scan_interval_hours: number
  last_scan_at: string | null
  auto_pr: boolean
  /** N7: when true, agents config is exported to <project>/.cockpit/config.json
   *  so the same setup can be shared with the team via git. */
  sync_config_to_project?: boolean
  /** N7: ISO timestamp of last successful config export. */
  config_synced_at?: string | null
  created_at: string
}

export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'last_scan_at'>

export interface ScanResult {
  path: string
  name: string
  stack: string[]
  git: {
    branch: string
    status: string
    lastCommit: string
    uncommittedChanges: number
    remoteUrl: string | null
  } | null
  agentConfigs: {
    hasClaudeDir: boolean
    hasOpenCodeDir: boolean
    hasAgentsMd: boolean
    claudeFiles: string[]
    openCodeFiles: string[]
  }
  structure: string[]
  todos: { file: string; line: number; text: string; type: string }[]
}

export interface AgentModel {
  id: string
  label: string
  cost: 'low' | 'medium' | 'high'
}

export interface InstalledAgent {
  name: string
  command: string
  path: string
  version: string | null
  models: AgentModel[]
  defaultModel: string | null
}

export interface DiscoveryCard {
  title: string
  description: string
  type: 'bugfix' | 'improvement' | 'chore' | 'discovery'
  priority: 'critical' | 'high' | 'medium' | 'low'
  source: 'scanner' | 'agent'
  metadata: Record<string, string>
  subProject?: string
}

export interface DiffFinding extends DiscoveryCard {
  fingerprint: string
  status: 'new' | 'existing' | 'resolved' | 'baseline'
  firstSeen: string
  linkedCardId: string | null
}

export interface ResolvedFinding extends DiscoveryCard {
  fingerprint: string
  firstSeen: string
  resolvedAt: string
}

export interface DiscoveryDiff {
  newCount: number
  baselineCount: number
  existingCount: number
  resolvedCount: number
  findings: DiffFinding[]
  resolved: ResolvedFinding[]
}

export interface DiscoveryResult {
  project: string
  scannedAt: string
  cards: DiscoveryCard[]
  scanResult: ScanResult
  diff?: DiscoveryDiff
}

export interface ImplementEvent {
  phase: 'analyzing' | 'branching' | 'implementing' | 'output' | 'file' | 'creating-pr' | 'done' | 'error'
  message?: string
  text?: string
  branch?: string
  action?: 'modified' | 'created' | 'deleted' | 'changed'
  path?: string
  summary?: { filesModified: number; filesCreated: number; filesDeleted: number; branch: string | null; prUrl?: string; prNumber?: number }
  exitCode?: number
}

export interface JobSummary {
  id: string
  projectPath: string
  agent?: string
  model?: string
  status: string
  createdAt: string
  completedAt: string | null
  cardsCount: number
  newCount: number
  baselineCount: number
  resolvedCount: number
}
