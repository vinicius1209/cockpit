import { api, DaemonError } from './client'
import type { Card, Workspace, BoardColumn, Project } from './client'

// O daemon armazena os Zustand stores em /api/data/<name> com payload
// { state: { ...partializedState }, version: N, _ts }. Aqui desempacotamos.

interface PersistEnvelope<S> {
  state?: S
  version?: number
  _ts?: number
}

// Lê um campo do state desempacotado. Retorna `undefined` se store ou campo
// não existem. Tipo de retorno deixado em `unknown` — caller faz cast guardado.
async function readField<T>(name: string, key: string): Promise<unknown> {
  const env = await api.getStore<PersistEnvelope<T>>(name)
  if (!env || !env.state) return undefined
  return (env.state as Record<string, unknown>)[key]
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
  const ws = await readField<WorkspaceStoreState>('workspaces', 'workspaces')
  return Array.isArray(ws) ? ws as Workspace[] : []
}

export async function loadActiveWorkspaceId(): Promise<string | null> {
  const v = await readField<WorkspaceStoreState>('workspaces', 'activeWorkspaceId')
  return typeof v === 'string' ? v : null
}

export async function loadCards(): Promise<Card[]> {
  const cards = await readField<CardStoreState>('cards', 'cards')
  return Array.isArray(cards) ? cards as Card[] : []
}

export async function loadColumns(): Promise<Record<string, BoardColumn[]>> {
  const cols = await readField<CardStoreState>('cards', 'columns')
  return cols && typeof cols === 'object' && !Array.isArray(cols) ? cols as Record<string, BoardColumn[]> : {}
}

export async function loadProjects(): Promise<Project[]> {
  const all = await readField<ProjectStoreState>('projects', 'projects')
  if (!all || typeof all !== 'object' || Array.isArray(all)) return []
  return Object.values(all as Record<string, Project[]>).flat()
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

// ── Mutations ──
//
// Como o frontend usa Zustand persist, o /api/data/<store> é sempre
// "full replace": lemos o envelope inteiro, mutamos o state, escrevemos
// de volta. Isto pode ter race condition se web UI estiver ativo, mas
// pra single-user funciona bem.

interface PersistEnvelope2<S> {
  state: S
  version: number
  _ts?: number
}

// Optimistic locking: GET retorna `version`, POST envia o mesmo version.
// Daemon retorna 409 se foi modificado entre o GET e o POST. Aqui captamos
// o erro e re-tentamos (refetch + remute + repost). Fix C1 do code review.

const MAX_RETRY_ATTEMPTS = 5

async function readAndPatch<S>(name: string, mutate: (state: S) => S): Promise<void> {
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const env = await api.getStore<PersistEnvelope2<S>>(name)
    if (!env || !env.state) {
      throw new Error(`Store "${name}" não encontrado ou vazio. Crie pelo web UI primeiro.`)
    }
    const patched: PersistEnvelope2<S> = {
      ...env,
      state: mutate(env.state),
      _ts: Date.now(),
    }
    try {
      await api.setStore(name, patched)
      return
    } catch (err) {
      // 409 version_conflict: outro cliente escreveu entre nosso GET e POST.
      // Refetch e remute.
      if (err instanceof DaemonError && err.status === 409 && err.message.includes('version_conflict')) {
        lastErr = err
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt - 1)))
        }
        continue
      }
      throw err
    }
  }
  throw new Error(`readAndPatch(${name}): ${MAX_RETRY_ATTEMPTS} tentativas falharam. Último erro: ${lastErr?.message}`)
}

export function newCardId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
}

export function newWorkspaceId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
}

export async function addCard(input: Card): Promise<void> {
  await readAndPatch<CardStoreState>('cards', (s) => ({
    ...s,
    cards: [...(s.cards || []), input],
  }))
}

export async function updateCard(cardId: string, patch: Partial<Card>): Promise<Card> {
  let updated: Card | null = null
  await readAndPatch<CardStoreState>('cards', (s) => ({
    ...s,
    cards: (s.cards || []).map((c) => {
      if (c.id !== cardId) return c
      updated = { ...c, ...patch, updated_at: new Date().toISOString() }
      return updated
    }),
  }))
  if (!updated) throw new Error(`card ${cardId} não encontrado`)
  return updated
}

export async function moveCardToColumn(cardId: string, targetColumnId: string): Promise<void> {
  await readAndPatch<CardStoreState>('cards', (s) => {
    const cards = s.cards || []
    const card = cards.find((c) => c.id === cardId)
    if (!card) throw new Error(`card ${cardId} não encontrado`)

    // Posicao = última da coluna alvo
    const targetCount = cards.filter((c) => c.column_id === targetColumnId).length

    return {
      ...s,
      cards: cards.map((c) =>
        c.id === cardId
          ? { ...c, column_id: targetColumnId, position: targetCount, updated_at: new Date().toISOString() }
          : c,
      ),
    }
  })
}

export async function deleteCard(cardId: string): Promise<void> {
  await readAndPatch<CardStoreState>('cards', (s) => ({
    ...s,
    cards: (s.cards || []).filter((c) => c.id !== cardId),
  }))
}

export async function addWorkspace(ws: Workspace): Promise<void> {
  await readAndPatch<WorkspaceStoreState>('workspaces', (s) => ({
    ...s,
    workspaces: [...(s.workspaces || []), ws],
  }))
}

export async function deleteWorkspace(wsId: string): Promise<void> {
  await readAndPatch<WorkspaceStoreState>('workspaces', (s) => ({
    ...s,
    workspaces: (s.workspaces || []).filter((w) => w.id !== wsId),
    activeWorkspaceId: s.activeWorkspaceId === wsId ? null : s.activeWorkspaceId,
  }))
}
