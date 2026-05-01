export interface Project {
  id: string
  workspace_id: string
  name: string
  path: string
  agent_preference: string | null
  auto_scan: boolean
  scan_interval_hours: number
  last_scan_at: string | null
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

export interface InstalledAgent {
  name: string
  command: string
  path: string
  version: string | null
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
