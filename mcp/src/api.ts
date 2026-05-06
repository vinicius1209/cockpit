// HTTP client minimo para o daemon. Reutiliza mesma URL que o CLI usa.

// Resolve URL no momento da chamada (nao no load) — permite testes
// sobrescreverem COCKPIT_DAEMON_URL via beforeAll.
export function getDaemonUrl(): string {
  return process.env.COCKPIT_DAEMON_URL || 'http://127.0.0.1:4800'
}

export async function daemonGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getDaemonUrl()}${path}`)
  if (!res.ok) throw new Error(`daemon ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

// F9-A — payload retornado pelo daemon quando o lock estah retido.
// O MCP tool `cockpit_implement_async` formata isso como texto rico
// pra o LLM entender a opcao de aguardar/abortar.
export interface LockHeldBy {
  session_id: string
  card_id?: string
  workspace_slug?: string
  agent?: string
  acquired_at: string
  age_seconds?: number
}

export class ProjectLockedError extends Error {
  readonly projectPath: string
  readonly heldBy: LockHeldBy
  readonly hints: string[]
  constructor(projectPath: string, heldBy: LockHeldBy, hints: string[] = []) {
    super(`project locked: ${projectPath}`)
    this.name = 'ProjectLockedError'
    this.projectPath = projectPath
    this.heldBy = heldBy
    this.hints = hints
  }
}

export async function daemonPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getDaemonUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 409) {
      const data = await res.json().catch(() => null) as {
        error?: string
        project_path?: string
        held_by?: LockHeldBy
        hints?: string[]
      } | null
      if (data?.error === 'project_locked' && data.held_by && data.project_path) {
        throw new ProjectLockedError(data.project_path, data.held_by, data.hints || [])
      }
    }
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`daemon ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ── Domain types ──

export interface Workspace {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string | null
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
  pr_url: string | null
  labels?: Array<{ label_id: string }>
}

export interface Project {
  id: string
  workspace_id: string
  name: string
  path: string
  auto_pr?: boolean
}

// Mirror of daemon/src/tasks/session-manager.ts:AgentSession (fields used by MCP)
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

interface PersistEnvelope<T> {
  state?: T
  version?: number
  _ts?: number
}

// ── Loaders ──

export async function loadWorkspaces(): Promise<Workspace[]> {
  const env = await daemonGet<PersistEnvelope<{ workspaces: Workspace[] }>>('/api/data/workspaces')
  return env?.state?.workspaces || []
}

export async function loadCards(): Promise<Card[]> {
  const env = await daemonGet<PersistEnvelope<{ cards: Card[] }>>('/api/data/cards')
  return env?.state?.cards || []
}

export async function loadColumns(): Promise<Record<string, BoardColumn[]>> {
  const env = await daemonGet<PersistEnvelope<{ columns: Record<string, BoardColumn[]> }>>('/api/data/cards')
  return env?.state?.columns || {}
}

export async function loadProjects(): Promise<Project[]> {
  const env = await daemonGet<PersistEnvelope<{ projects: Record<string, Project[]> }>>('/api/data/projects')
  const all = env?.state?.projects || {}
  return Object.values(all).flat()
}

// ── Mutations (read-modify-write como CLI) ──

export async function patchCardsStore<T extends { cards: Card[] }>(
  mutate: (state: T) => T,
): Promise<void> {
  const env = await daemonGet<PersistEnvelope<T>>('/api/data/cards')
  if (!env?.state) throw new Error('cards store nao inicializado')
  const next = { ...env, state: mutate(env.state), _ts: Date.now() }
  await daemonPost('/api/data/cards', next)
}

// ── Helpers ──

export function shortId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
}

export function resolveCard(ref: string, cards: Card[]): Card | undefined {
  if (!ref) return undefined
  const cleaned = ref.replace(/^#/, '').toLowerCase()
  const exact = cards.find((c) => c.id === ref)
  if (exact) return exact
  const short = cards.find((c) => shortId(c.id).toLowerCase() === cleaned)
  if (short) return short
  const prefix = cards.filter((c) => c.id.toLowerCase().startsWith(cleaned))
  if (prefix.length === 1) return prefix[0]
  return undefined
}

export function resolveWorkspace(ref: string, workspaces: Workspace[]): Workspace | undefined {
  if (!ref) return undefined
  const lower = ref.toLowerCase()
  return workspaces.find(
    (w) => w.slug === lower || w.name.toLowerCase() === lower || w.id === ref,
  )
}

export function newCardId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
}
