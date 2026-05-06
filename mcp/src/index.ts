#!/usr/bin/env bun
// Cockpit MCP server — exposes Cockpit (workspaces/cards/specs) as tools that
// any MCP-compatible client (Claude Code, Cursor, etc) can call.
//
// Communication: stdio (JSON-RPC 2.0). Auto-launched by the client.
// Backend: HTTP requests to the local daemon (127.0.0.1:4800).
//
// Tools exposed:
//   - cockpit_list_workspaces
//   - cockpit_list_cards
//   - cockpit_show_card
//   - cockpit_create_card
//   - cockpit_move_card
//   - cockpit_search
//   - cockpit_metrics
//   - cockpit_health
//
// Resources:
//   - cockpit://card/<id>     → markdown completo do card
//   - cockpit://board/<ws>    → ASCII kanban do workspace

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  loadWorkspaces, loadCards, loadColumns, loadProjects,
  patchCardsStore, daemonGet, daemonPost,
  resolveCard, resolveWorkspace, shortId, newCardId,
  ProjectLockedError,
  type AgentSession,
} from './api'

const VERSION = '0.2.0'

const server = new Server(
  { name: 'cockpit', version: VERSION },
  { capabilities: { tools: {}, resources: {} } },
)

// ── Tools registry ──

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'cockpit_health',
      description: 'Check Cockpit daemon status. Returns daemon version and online state.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'cockpit_list_workspaces',
      description: 'List all workspaces with card counts and activity stats.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'cockpit_list_cards',
      description:
        'List cards filterable by workspace, type, priority and spec status. ' +
        'Useful for triage queries like "all critical bugs" or "ready to implement in workspace X".',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: { type: 'string', description: 'Workspace slug or name (optional)' },
          type: { type: 'string', enum: ['feature', 'bugfix', 'hotfix', 'discovery', 'chore', 'improvement'] },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          spec_status: { type: 'string', enum: ['draft', 'ready', 'in_progress', 'review', 'done'] },
          column_slug: { type: 'string', description: 'Filter by column (inbox, ready, in-progress, etc)' },
          include_archived: { type: 'boolean', description: 'Inclui cards descartados (default false — arquivados nao aparecem)', default: false },
          only_archived: { type: 'boolean', description: 'Mostra APENAS descartados', default: false },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
      },
    },
    {
      name: 'cockpit_show_card',
      description:
        'Get full details of a card including title, description, spec content, interview notes, and metadata. ' +
        'Accepts short ID (SW78) or full ID. Use this when user asks "what is card X about" or to read spec.',
      inputSchema: {
        type: 'object',
        properties: {
          card_id: { type: 'string', description: 'Card short ID (SW78) or full ID' },
        },
        required: ['card_id'],
      },
    },
    {
      name: 'cockpit_create_card',
      description:
        'Create a new card in the active or specified workspace. Returns the new card with short ID. ' +
        'Use this when user says "create a card for X" or to capture work items.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title (required)' },
          type: { type: 'string', enum: ['feature', 'bugfix', 'hotfix', 'discovery', 'chore', 'improvement'], default: 'feature' },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
          description: { type: 'string', description: 'Markdown description (optional)' },
          workspace: { type: 'string', description: 'Workspace slug or name (default: first workspace)' },
          column_slug: { type: 'string', description: 'Initial column (default: inbox)' },
        },
        required: ['title'],
      },
    },
    {
      name: 'cockpit_move_card',
      description: 'Move a card to a different column (inbox, discovery, spec, ready, in-progress, review, done).',
      inputSchema: {
        type: 'object',
        properties: {
          card_id: { type: 'string' },
          column_slug: { type: 'string', description: 'Target column slug' },
        },
        required: ['card_id', 'column_slug'],
      },
    },
    {
      name: 'cockpit_search',
      description:
        'Search cross-workspace by substring in titles, descriptions, specs and interview notes. ' +
        'Returns ranked hits with excerpts. Useful when user asks "find cards about auth" or to avoid duplicate work.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          in: { type: 'string', enum: ['cards', 'specs', 'all'], default: 'all' },
          limit: { type: 'number', default: 20 },
        },
        required: ['query'],
      },
    },
    {
      name: 'cockpit_metrics',
      description:
        'Get global metrics: total cards, done/wip counts, lead time, agent run success rate, ' +
        'per-workspace breakdown. Use this for "how am I doing" or progress reports.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'cockpit_archive_card',
      description:
        'Descarta um card (archive). NAO eh delete — mantem spec, entrevista, sessions e todo historico no DB. ' +
        'Some do board mas pode ser reativado. Use isso quando o usuario decide nao fazer ou abandonou um card. ' +
        'Para restaurar, use cockpit_unarchive_card.',
      inputSchema: {
        type: 'object',
        properties: {
          card_id: { type: 'string', description: 'Card short ID (SW78) ou full ID' },
        },
        required: ['card_id'],
      },
    },
    {
      name: 'cockpit_unarchive_card',
      description: 'Reativa um card descartado — volta a aparecer no board.',
      inputSchema: {
        type: 'object',
        properties: {
          card_id: { type: 'string' },
        },
        required: ['card_id'],
      },
    },
    {
      name: 'cockpit_implement_async',
      description:
        'Trigger implementation of a card in the background. The card must have a ready spec and a project linked to its workspace. ' +
        'Returns immediately with sessionId — use cockpit_get_session to poll progress, or open SSE at /agents/sessions/<id>/stream. ' +
        'Optionally accepts feedback for re-implementation attempts.',
      inputSchema: {
        type: 'object',
        properties: {
          card_id: { type: 'string', description: 'Card short ID (SW78) or full ID' },
          feedback: { type: 'string', description: 'Optional feedback for re-implementation (when previous attempt missed something)' },
          no_pr: { type: 'boolean', description: 'Skip auto-PR even if project has auto_pr=true', default: false },
          isolation: {
            type: 'string',
            enum: ['lock', 'worktree'],
            description: 'lock (default) serializa por projeto. worktree cria git worktree separado pra esta session — paralelismo real no mesmo projeto, com custo (disco + node_modules nao compartilhado + portas conflitam). Use worktree quando o usuario quer rodar 2+ implements no mesmo projeto AO MESMO TEMPO.',
            default: 'lock',
          },
        },
        required: ['card_id'],
      },
    },
    {
      name: 'cockpit_edit_card',
      description:
        'Atualiza campos de um card existente (titulo, tipo, prioridade, descricao, assignee, due_date). ' +
        'Use quando o usuario pede pra mudar info de um card sem precisar abrir o dialog. Apenas campos ' +
        'incluidos sao alterados — campos omitidos ficam como estao.',
      inputSchema: {
        type: 'object',
        properties: {
          card_id: { type: 'string', description: 'Card short ID (SW78) ou full ID' },
          title: { type: 'string' },
          type: { type: 'string', enum: ['feature', 'bugfix', 'hotfix', 'discovery', 'chore', 'improvement'] },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          description: { type: 'string' },
          assignee: { type: 'string', description: 'use string vazia "" para limpar' },
          due_date: { type: 'string', description: 'YYYY-MM-DD ou string vazia "" para limpar' },
        },
        required: ['card_id'],
      },
    },
    {
      name: 'cockpit_set_active_workspace',
      description:
        'Muda o workspace ativo (compartilhado entre CLI e MCP via ~/.cockpit/cli.json). ' +
        'Afeta o "default workspace" usado por cockpit_create_card e por comandos CLI sem --ws. ' +
        'O Web UI tem seu proprio active workspace (sidebar) que nao e afetado.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: { type: 'string', description: 'Workspace slug ou nome' },
        },
        required: ['workspace'],
      },
    },
    {
      name: 'cockpit_abort_session',
      description:
        'Aborta uma session em curso (mata o processo do agent, marca phase=error). ' +
        'Use quando o usuario pede pra parar uma implementacao que esta andando errada ou demorando demais. ' +
        'Idempotente — se a session ja terminou, retorna o estado atual sem erro.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session id retornado por cockpit_implement_async' },
        },
        required: ['session_id'],
      },
    },
    {
      name: 'cockpit_get_session',
      description:
        'Get status of an agent session by id. Returns phase (analyzing/implementing/done/error), agent, model, ' +
        'startedAt, completedAt, exitCode, and the most recent output chunks. Use after cockpit_implement_async ' +
        'to check progress, or to inspect any past run.',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session id returned by cockpit_implement_async' },
          tail_chunks: { type: 'number', description: 'Number of most recent output chunks to include (default 20)', default: 20 },
        },
        required: ['session_id'],
      },
    },
  ],
}))

// ── Tool handlers ──

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name
  const args = (req.params.arguments || {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'cockpit_health':       return ok(await toolHealth())
      case 'cockpit_list_workspaces': return ok(await toolListWorkspaces())
      case 'cockpit_list_cards':   return ok(await toolListCards(args as ListCardsArgs))
      case 'cockpit_show_card':    return ok(await toolShowCard(args as { card_id: string }))
      case 'cockpit_create_card':  return ok(await toolCreateCard(args as unknown as CreateCardArgs))
      case 'cockpit_move_card':    return ok(await toolMoveCard(args as { card_id: string; column_slug: string }))
      case 'cockpit_archive_card':   return ok(await toolArchiveCard(args as { card_id: string }))
      case 'cockpit_unarchive_card': return ok(await toolUnarchiveCard(args as { card_id: string }))
      case 'cockpit_search':       return ok(await toolSearch(args as { query: string; in?: string; limit?: number }))
      case 'cockpit_metrics':      return ok(await toolMetrics())
      case 'cockpit_edit_card':    return ok(await toolEditCard(args as unknown as EditCardArgs))
      case 'cockpit_set_active_workspace': return ok(await toolSetActiveWorkspace(args as { workspace: string }))
      case 'cockpit_abort_session':  return ok(await toolAbortSession(args as { session_id: string }))
      case 'cockpit_implement_async': return ok(await toolImplementAsync(args as unknown as ImplementAsyncArgs))
      case 'cockpit_get_session':  return ok(await toolGetSession(args as { session_id: string; tail_chunks?: number }))
      default: throw new Error(`unknown tool: ${name}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: 'text' as const, text: `Error: ${msg}` }],
      isError: true,
    }
  }
})

function ok(payload: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return { content: [{ type: 'text', text }] }
}

// ── Tool implementations ──

async function toolHealth(): Promise<unknown> {
  const h = await daemonGet<{ status: string; version: string }>('/health')
  return { ok: true, daemon_version: h.version, mcp_version: VERSION }
}

async function toolListWorkspaces(): Promise<unknown> {
  const [workspaces, cards] = await Promise.all([loadWorkspaces(), loadCards()])
  return workspaces.map((w) => {
    const wsCards = cards.filter((c) => c.workspace_id === w.id)
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      description: w.description,
      cards_total: wsCards.length,
      cards_in_progress: wsCards.filter((c) => c.spec_status === 'in_progress').length,
      cards_review: wsCards.filter((c) => c.spec_status === 'review').length,
      cards_done: wsCards.filter((c) => c.spec_status === 'done').length,
    }
  })
}

interface ListCardsArgs {
  workspace?: string
  type?: string
  priority?: string
  spec_status?: string
  column_slug?: string
  include_archived?: boolean
  only_archived?: boolean
  limit?: number
}

async function toolListCards(args: ListCardsArgs): Promise<unknown> {
  const [workspaces, cards, columns] = await Promise.all([
    loadWorkspaces(), loadCards(), loadColumns(),
  ])

  let filtered = cards
  if (args.workspace) {
    const ws = resolveWorkspace(args.workspace, workspaces)
    if (!ws) throw new Error(`workspace not found: ${args.workspace}`)
    filtered = filtered.filter((c) => c.workspace_id === ws.id)
  }
  if (args.type) filtered = filtered.filter((c) => c.type === args.type)
  if (args.priority) filtered = filtered.filter((c) => c.priority === args.priority)
  if (args.spec_status) filtered = filtered.filter((c) => c.spec_status === args.spec_status)
  if (args.column_slug) {
    filtered = filtered.filter((c) => {
      const col = (columns[c.workspace_id] || []).find((co) => co.id === c.column_id)
      return col?.slug === args.column_slug
    })
  }
  // F10 archived: por default, escondidos. only_archived sobrescreve include_archived.
  if (args.only_archived) {
    filtered = filtered.filter((c) => !!c.archived_at)
  } else if (!args.include_archived) {
    filtered = filtered.filter((c) => !c.archived_at)
  }

  const limit = args.limit ?? 50
  return filtered
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit)
    .map((c) => {
      const ws = workspaces.find((w) => w.id === c.workspace_id)
      const col = (columns[c.workspace_id] || []).find((co) => co.id === c.column_id)
      return {
        id: shortId(c.id),
        full_id: c.id,
        title: c.title,
        type: c.type,
        priority: c.priority,
        spec_status: c.spec_status,
        column: col?.slug,
        workspace: ws?.slug,
        updated_at: c.updated_at,
      }
    })
}

async function toolShowCard(args: { card_id: string }): Promise<unknown> {
  const [workspaces, cards, columns, projects] = await Promise.all([
    loadWorkspaces(), loadCards(), loadColumns(), loadProjects(),
  ])
  const card = resolveCard(args.card_id, cards)
  if (!card) throw new Error(`card not found: ${args.card_id}`)
  const ws = workspaces.find((w) => w.id === card.workspace_id)
  const col = (columns[card.workspace_id] || []).find((co) => co.id === card.column_id)
  const project = card.project_id ? projects.find((p) => p.id === card.project_id) : null

  return {
    id: shortId(card.id),
    full_id: card.id,
    title: card.title,
    type: card.type,
    priority: card.priority,
    description: card.description,
    spec_status: card.spec_status,
    spec_content: card.spec_content,
    interview_notes: card.interview_notes,
    workspace: { name: ws?.name, slug: ws?.slug },
    column: col?.slug,
    project: project ? { name: project.name, path: project.path } : null,
    assignee: card.assignee,
    due_date: card.due_date,
    created_at: card.created_at,
    updated_at: card.updated_at,
  }
}

interface CreateCardArgs {
  title: string
  type?: string
  priority?: string
  description?: string
  workspace?: string
  column_slug?: string
}

async function toolCreateCard(args: CreateCardArgs): Promise<unknown> {
  const [workspaces, columns] = await Promise.all([loadWorkspaces(), loadColumns()])
  const ws = args.workspace
    ? resolveWorkspace(args.workspace, workspaces)
    : workspaces[0]
  if (!ws) throw new Error('no workspace available — create one first')

  const wsCols = (columns[ws.id] || []).sort((a, b) => a.position - b.position)
  if (wsCols.length === 0) throw new Error(`workspace "${ws.name}" has no columns`)
  const col = args.column_slug
    ? wsCols.find((co) => co.slug === args.column_slug)
    : wsCols[0]
  if (!col) throw new Error(`column not found: ${args.column_slug}`)

  const cardId = newCardId()
  const now = new Date().toISOString()
  const newCard = {
    id: cardId,
    workspace_id: ws.id,
    column_id: col.id,
    project_id: null,
    title: args.title.trim(),
    description: args.description?.trim() || null,
    type: args.type || 'feature',
    priority: args.priority || 'medium',
    position: 0,
    assignee: null,
    due_date: null,
    spec_status: null,
    spec_content: null,
    interview_notes: null,
    created_at: now,
    updated_at: now,
    archived_at: null as string | null,
    labels: [],
  }

  await patchCardsStore<{ cards: typeof newCard[] } & Record<string, unknown>>((s) => ({
    ...s,
    cards: [...(s.cards || []), newCard],
  }))

  return {
    id: shortId(cardId),
    full_id: cardId,
    title: newCard.title,
    workspace: ws.slug,
    column: col.slug,
    type: newCard.type,
    priority: newCard.priority,
  }
}

async function toolArchiveCard(args: { card_id: string }): Promise<unknown> {
  const cards = await loadCards()
  const card = resolveCard(args.card_id, cards)
  if (!card) throw new Error(`card not found: ${args.card_id}`)
  if (card.archived_at) {
    return { id: shortId(card.id), already_archived: true, archived_at: card.archived_at }
  }
  const now = new Date().toISOString()
  await patchCardsStore<{ cards: typeof cards }>((s) => ({
    ...s,
    cards: (s.cards || []).map((c) =>
      c.id === card.id ? { ...c, archived_at: now, updated_at: now } : c,
    ),
  }))
  return { id: shortId(card.id), title: card.title, archived_at: now, status: 'archived' }
}

async function toolUnarchiveCard(args: { card_id: string }): Promise<unknown> {
  const cards = await loadCards()
  const card = resolveCard(args.card_id, cards)
  if (!card) throw new Error(`card not found: ${args.card_id}`)
  if (!card.archived_at) {
    return { id: shortId(card.id), already_active: true }
  }
  const now = new Date().toISOString()
  await patchCardsStore<{ cards: typeof cards }>((s) => ({
    ...s,
    cards: (s.cards || []).map((c) =>
      c.id === card.id ? { ...c, archived_at: null, updated_at: now } : c,
    ),
  }))
  return { id: shortId(card.id), title: card.title, status: 'active' }
}

interface EditCardArgs {
  card_id: string
  title?: string
  type?: string
  priority?: string
  description?: string
  assignee?: string
  due_date?: string
}

async function toolEditCard(args: EditCardArgs): Promise<unknown> {
  const cards = await loadCards()
  const card = resolveCard(args.card_id, cards)
  if (!card) throw new Error(`card not found: ${args.card_id}`)

  const patch: Partial<typeof card> = {}
  if (args.title !== undefined) patch.title = args.title
  if (args.type !== undefined) patch.type = args.type
  if (args.priority !== undefined) patch.priority = args.priority
  if (args.description !== undefined) patch.description = args.description || null
  if (args.assignee !== undefined) patch.assignee = args.assignee === '' ? null : args.assignee
  if (args.due_date !== undefined) patch.due_date = args.due_date === '' ? null : args.due_date

  if (Object.keys(patch).length === 0) {
    return { id: shortId(card.id), changed: false, message: 'nenhum campo para atualizar' }
  }

  const now = new Date().toISOString()
  await patchCardsStore<{ cards: typeof cards }>((s) => ({
    ...s,
    cards: (s.cards || []).map((c) =>
      c.id === card.id ? { ...c, ...patch, updated_at: now } : c,
    ),
  }))

  return {
    id: shortId(card.id),
    changed: true,
    fields: Object.keys(patch),
    title: patch.title ?? card.title,
  }
}

async function toolSetActiveWorkspace(args: { workspace: string }): Promise<unknown> {
  const workspaces = await loadWorkspaces()
  const ws = resolveWorkspace(args.workspace, workspaces)
  if (!ws) {
    throw new Error(`workspace nao encontrado: ${args.workspace}. Disponiveis: ${workspaces.map((w) => w.slug).join(', ')}`)
  }

  // Escreve em ~/.cockpit/cli.json (mesmo arquivo que o CLI usa)
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')
  const { existsSync, readFileSync } = await import('node:fs')
  const file = join(homedir(), '.cockpit', 'cli.json')
  let cur: Record<string, unknown> = {}
  if (existsSync(file)) {
    try { cur = JSON.parse(readFileSync(file, 'utf-8')) } catch { cur = {} }
  }
  cur.activeWorkspaceSlug = ws.slug
  await Bun.write(file, JSON.stringify(cur, null, 2))

  return {
    active_workspace: { slug: ws.slug, name: ws.name },
    persisted_at: file,
    note: 'compartilhado entre CLI e MCP. Web UI tem state separado (sidebar).',
  }
}

async function toolAbortSession(args: { session_id: string }): Promise<unknown> {
  const res = await fetch(`${DAEMON_HINT}/agents/sessions/${args.session_id}/abort`, {
    method: 'POST',
  })
  const data = await res.json().catch(() => null) as Record<string, unknown> | null
  if (res.status === 404) {
    throw new Error(`session nao encontrada: ${args.session_id}`)
  }
  return {
    session_id: args.session_id,
    aborted: data?.aborted ?? false,
    reason: data?.reason ?? (res.ok ? 'ok' : 'falha'),
    phase: data?.phase,
  }
}

async function toolMoveCard(args: { card_id: string; column_slug: string }): Promise<unknown> {
  const [cards, columns] = await Promise.all([loadCards(), loadColumns()])
  const card = resolveCard(args.card_id, cards)
  if (!card) throw new Error(`card not found: ${args.card_id}`)
  const wsCols = (columns[card.workspace_id] || []).sort((a, b) => a.position - b.position)
  const target = wsCols.find((co) => co.slug === args.column_slug)
  if (!target) throw new Error(`column not found: ${args.column_slug}. Available: ${wsCols.map((c) => c.slug).join(', ')}`)

  const targetCount = cards.filter((c) => c.column_id === target.id).length
  await patchCardsStore<{ cards: typeof cards }>((s) => ({
    ...s,
    cards: (s.cards || []).map((c) =>
      c.id === card.id
        ? { ...c, column_id: target.id, position: targetCount, updated_at: new Date().toISOString() }
        : c,
    ),
  }))

  return { id: shortId(card.id), moved_to: target.slug }
}

async function toolSearch(args: { query: string; in?: string; limit?: number }): Promise<unknown> {
  const q = args.query.toLowerCase()
  const filter = args.in || 'all'
  const limit = args.limit ?? 20
  const [workspaces, cards] = await Promise.all([loadWorkspaces(), loadCards()])
  const wsById = new Map(workspaces.map((w) => [w.id, w]))

  type Hit = {
    id: string
    full_id: string
    title: string
    type: string
    priority: string
    workspace: string
    field: string
    excerpt: string
    score: number
  }

  const hits: Hit[] = []
  for (const card of cards) {
    const ws = wsById.get(card.workspace_id)
    if (!ws) continue
    const baseHit = {
      id: shortId(card.id),
      full_id: card.id,
      title: card.title,
      type: card.type,
      priority: card.priority,
      workspace: ws.slug,
    }

    if ((filter === 'all' || filter === 'cards') && card.title.toLowerCase().includes(q)) {
      hits.push({ ...baseHit, field: 'title', excerpt: card.title, score: 10 })
    }
    if ((filter === 'all' || filter === 'cards') && card.description?.toLowerCase().includes(q)) {
      hits.push({ ...baseHit, field: 'description', excerpt: extractExcerpt(card.description, q), score: 5 })
    }
    if ((filter === 'all' || filter === 'specs') && card.spec_content?.toLowerCase().includes(q)) {
      hits.push({ ...baseHit, field: 'spec', excerpt: extractExcerpt(card.spec_content, q), score: 7 })
    }
    if (filter === 'all' && card.interview_notes?.toLowerCase().includes(q)) {
      hits.push({ ...baseHit, field: 'interview', excerpt: extractExcerpt(card.interview_notes, q), score: 3 })
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

async function toolMetrics(): Promise<unknown> {
  return await daemonGet('/api/metrics')
}

interface ImplementAsyncArgs {
  card_id: string
  feedback?: string
  no_pr?: boolean
  isolation?: 'lock' | 'worktree'
}

async function toolImplementAsync(args: ImplementAsyncArgs): Promise<unknown> {
  const [workspaces, cards, projects] = await Promise.all([
    loadWorkspaces(), loadCards(), loadProjects(),
  ])
  const card = resolveCard(args.card_id, cards)
  if (!card) throw new Error(`card not found: ${args.card_id}`)
  if (!card.spec_content) {
    throw new Error(`card #${shortId(card.id)} has no spec — generate one first (use cockpit web UI or CLI cockpit spec gen)`)
  }
  const ws = workspaces.find((w) => w.id === card.workspace_id)
  if (!ws) throw new Error('workspace not found for card')

  const wsProjects = projects.filter((p) => p.workspace_id === ws.id)
  const project = card.project_id
    ? wsProjects.find((p) => p.id === card.project_id)
    : wsProjects[0]
  if (!project) {
    throw new Error(`workspace "${ws.name}" has no project linked. Link one in workspace settings → Projects.`)
  }

  const body = {
    cardTitle: card.title,
    cardType: card.type,
    cardId: card.id,
    workspaceSlug: ws.slug,
    spec: card.spec_content,
    interviewNotes: card.interview_notes || undefined,
    projectPath: project.path,
    createBranch: true,
    autoPR: !args.no_pr && (project.auto_pr ?? false),
    feedback: args.feedback,
    attempt: 1,
    isolation: args.isolation || 'lock',
  }

  let res: { sessionId: string; status: string }
  try {
    res = await daemonPost<{ sessionId: string; status: string }>('/agents/implement/async', body)
  } catch (err) {
    if (err instanceof ProjectLockedError) {
      // F9-A — surface payload estruturado pra o LLM saber que ha outra
      // session rodando no mesmo projeto e oferecer ao usuario opcoes claras.
      const ageMin = err.heldBy.age_seconds ? Math.floor(err.heldBy.age_seconds / 60) : 0
      const ageStr = err.heldBy.age_seconds && err.heldBy.age_seconds < 60
        ? `${err.heldBy.age_seconds}s`
        : `${ageMin}m${(err.heldBy.age_seconds || 0) % 60}s`
      throw new Error(
        `project_locked — outra implementacao ja roda neste projeto.\n` +
        `held_by:\n` +
        `  session: ${err.heldBy.session_id}\n` +
        (err.heldBy.card_id ? `  card: #${shortId(err.heldBy.card_id)}\n` : '') +
        (err.heldBy.workspace_slug ? `  workspace: ${err.heldBy.workspace_slug}\n` : '') +
        (err.heldBy.agent ? `  agent: ${err.heldBy.agent}\n` : '') +
        `  rodando ha: ${ageStr}\n` +
        `\nopcoes pro usuario:\n` +
        `  - aguarde a session atual terminar (chame cockpit_get_session com o session_id acima pra ver progresso)\n` +
        `  - peca pro usuario abortar pelo Web UI ou cockpit log\n` +
        `  - dispare em outro projeto, ou aguarde\n` +
        `  - modo --isolation worktree (paralelo real) chega no F9-B`
      )
    }
    throw err
  }

  return {
    session_id: res.sessionId,
    status: res.status,
    card: { id: shortId(card.id), title: card.title },
    workspace: ws.slug,
    project: project.name,
    follow_up: {
      poll: `cockpit_get_session({ session_id: "${res.sessionId}" })`,
      sse: `${DAEMON_HINT}/agents/sessions/${res.sessionId}/stream`,
    },
  }
}

async function toolGetSession(args: { session_id: string; tail_chunks?: number }): Promise<unknown> {
  const tail = args.tail_chunks ?? 20
  const data = await daemonGet<{ session: AgentSession | null }>(`/agents/sessions/${args.session_id}`)
  if (!data.session) throw new Error(`session not found: ${args.session_id}`)
  const s = data.session
  const allChunks = s.chunks || []
  const tailChunks = tail > 0 ? allChunks.slice(-tail) : []
  const elapsed = s.completedAt
    ? (new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000
    : (Date.now() - new Date(s.startedAt).getTime()) / 1000
  return {
    id: s.id,
    card_id: shortId(s.cardId),
    full_card_id: s.cardId,
    workspace_slug: s.workspaceSlug,
    action: s.action,
    agent: s.agent,
    model: s.model,
    phase: s.phase,
    is_running: !s.completedAt && s.phase !== 'error',
    started_at: s.startedAt,
    completed_at: s.completedAt,
    elapsed_seconds: Math.round(elapsed),
    exit_code: s.exitCode,
    error: s.error,
    chunk_count: allChunks.length,
    tail_chunks: tailChunks,
  }
}

const DAEMON_HINT = process.env.COCKPIT_DAEMON_URL || 'http://127.0.0.1:4800'

function extractExcerpt(text: string, q: string, ctx = 60): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) return text.slice(0, 100)
  const start = Math.max(0, idx - ctx)
  const end = Math.min(text.length, idx + q.length + ctx)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\n+/g, ' ') + (end < text.length ? '…' : '')
}

// ── Resources ──

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const [workspaces, cards] = await Promise.all([loadWorkspaces(), loadCards()])
  return {
    resources: [
      ...cards.slice(0, 50).map((c) => ({
        uri: `cockpit://card/${shortId(c.id)}`,
        name: `Card #${shortId(c.id)} — ${c.title}`,
        description: `${c.type} · ${c.priority} · ${c.spec_status || 'no spec'}`,
        mimeType: 'text/markdown',
      })),
      ...workspaces.map((w) => ({
        uri: `cockpit://board/${w.slug}`,
        name: `Board · ${w.name}`,
        description: w.description || `${w.slug} kanban board`,
        mimeType: 'text/plain',
      })),
    ],
  }
})

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri
  const cardMatch = uri.match(/^cockpit:\/\/card\/(.+)$/)
  if (cardMatch) {
    const cards = await loadCards()
    const card = resolveCard(cardMatch[1], cards)
    if (!card) throw new Error(`card not found: ${cardMatch[1]}`)
    const md = renderCardMarkdown(card)
    return { contents: [{ uri, mimeType: 'text/markdown', text: md }] }
  }
  const boardMatch = uri.match(/^cockpit:\/\/board\/(.+)$/)
  if (boardMatch) {
    const [workspaces, cards, columns] = await Promise.all([
      loadWorkspaces(), loadCards(), loadColumns(),
    ])
    const ws = resolveWorkspace(boardMatch[1], workspaces)
    if (!ws) throw new Error(`workspace not found: ${boardMatch[1]}`)
    const wsCols = (columns[ws.id] || []).sort((a, b) => a.position - b.position)
    const wsCards = cards.filter((c) => c.workspace_id === ws.id)
    const text = renderBoardText(ws.name, wsCols, wsCards)
    return { contents: [{ uri, mimeType: 'text/plain', text }] }
  }
  throw new Error(`unknown resource: ${uri}`)
})

function renderCardMarkdown(card: import('./api').Card): string {
  const lines = [
    `# Card #${shortId(card.id)} — ${card.title}`,
    '',
    `**Type:** ${card.type}  `,
    `**Priority:** ${card.priority}  `,
    card.assignee ? `**Assignee:** ${card.assignee}  ` : '',
    card.due_date ? `**Due:** ${card.due_date}  ` : '',
    `**Spec status:** ${card.spec_status || '—'}  `,
    `**Created:** ${card.created_at}  `,
    `**Updated:** ${card.updated_at}  `,
    '',
  ]
  if (card.description?.trim()) {
    lines.push('## Description', '', card.description, '')
  }
  if (card.interview_notes?.trim()) {
    lines.push('## Interview notes', '', card.interview_notes, '')
  }
  if (card.spec_content?.trim()) {
    lines.push('## Spec', '', card.spec_content, '')
  }
  return lines.filter(Boolean).join('\n')
}

function renderBoardText(
  wsName: string,
  cols: import('./api').BoardColumn[],
  cards: import('./api').Card[],
): string {
  const lines = [`Kanban: ${wsName}`, '']
  for (const col of cols) {
    const colCards = cards.filter((c) => c.column_id === col.id)
    lines.push(`## ${col.name} (${colCards.length})`)
    for (const c of colCards) {
      lines.push(`  - #${shortId(c.id)} [${c.type}/${c.priority}] ${c.title}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ── Boot ──

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // STDOUT is reserved for JSON-RPC. Logs MUST go to stderr.
  process.stderr.write(`[cockpit-mcp] connected (v${VERSION})\n`)
}

main().catch((err) => {
  process.stderr.write(`[cockpit-mcp] fatal: ${err}\n`)
  process.exit(1)
})
