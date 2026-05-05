import { loadAll, addCard, moveCardToColumn, deleteCard, newCardId, updateCard } from '../api/store'
import { api } from '../api/client'
import { resolveCard, resolveWorkspace, shortId } from '../api/resolve'
import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { table } from '../ui/table'
import { readConfigAsync } from '../config/daemon'

interface ListFilters {
  ws?: string
  type?: string
  priority?: string
  status?: string  // spec_status
  asJson?: boolean
}

export async function cardList(filters: ListFilters = {}): Promise<void> {
  const { workspaces, cards, columns } = await loadAll()
  const cli = await readConfigAsync()

  // Filter by workspace
  let target = filters.ws
    ? resolveWorkspace(filters.ws, workspaces)
    : workspaces.find((w) => w.slug === cli.activeWorkspaceSlug)
  let filtered = target ? cards.filter((c) => c.workspace_id === target!.id) : cards
  if (filters.type) filtered = filtered.filter((c) => c.type === filters.type)
  if (filters.priority) filtered = filtered.filter((c) => c.priority === filters.priority)
  if (filters.status) filtered = filtered.filter((c) => c.spec_status === filters.status)

  if (filters.asJson) {
    console.log(JSON.stringify(filtered, null, 2))
    return
  }

  // Live status do daemon
  let liveCardIds = new Set<string>()
  try {
    const { sessions } = await api.listRunningSessions()
    liveCardIds = new Set(sessions.map((s) => s.cardId))
  } catch { /* ok */ }

  console.log(divider(`CARDS${target ? ` · ${target.name}` : ' · todos'}`, 'gray'))
  console.log()

  if (filtered.length === 0) {
    console.log(c.dim('  nenhum card encontrado com esses filtros.'))
    return
  }

  const cardsById = new Map<string, typeof filtered[number]>(filtered.map((c) => [c.id, c]))
  void cardsById

  const rows = filtered
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((card) => {
      const ws = workspaces.find((w) => w.id === card.workspace_id)
      const col = (columns[card.workspace_id] || []).find((co) => co.id === card.column_id)
      const live = liveCardIds.has(card.id) ? c.amber(' LIVE') : ''
      return {
        id: c.dim('#' + shortId(card.id)),
        type: typeColor(card.type)(card.type.slice(0, 4).toUpperCase()),
        prio: prioColor(card.priority)(card.priority.slice(0, 4)),
        title: truncate(card.title, 50) + live,
        status: card.spec_status ? c.dim(card.spec_status) : c.dim('—'),
        col: c.dim(col?.slug || '—'),
        ws: target ? '' : c.dim('#' + (ws?.slug || '?')),
      }
    })

  const cols = [
    { key: 'id', label: 'id' },
    { key: 'type', label: 'type' },
    { key: 'prio', label: 'prio' },
    { key: 'title', label: 'title' },
    { key: 'status', label: 'spec' },
    { key: 'col', label: 'column' },
  ]
  if (!target) cols.push({ key: 'ws', label: 'ws' })

  console.log(table(rows, cols))
  console.log()
  console.log(c.dim(`  ${filtered.length} cards · use cockpit card show <#ID>`))
}

export async function cardShow(ref: string): Promise<void> {
  const { workspaces, cards, columns, projects } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card nao encontrado: ') + ref)
    console.log(c.dim('  cockpit card list para ver disponiveis'))
    process.exit(1)
  }

  const ws = workspaces.find((w) => w.id === card.workspace_id)
  const col = (columns[card.workspace_id] || []).find((co) => co.id === card.column_id)
  const proj = card.project_id ? projects.find((p) => p.id === card.project_id) : null

  // Live state
  let session = null as Awaited<ReturnType<typeof api.getLatestSession>>['session'] | null
  if (ws) {
    try {
      const r = await api.getLatestSession(ws.slug, card.id)
      session = r.session
    } catch { /* ok */ }
  }

  const isLive = session?.phase && session.phase !== 'done' && session.phase !== 'error' && !session.completedAt

  // Header
  console.log(divider(`CARD · #${shortId(card.id)}${isLive ? '  ● LIVE' : ''}`, isLive ? 'amber' : 'cyan'))
  console.log()

  // Identification
  console.log(section('Identificacao'))
  console.log(`  ${c.bold(card.title)}`)
  console.log(`  ${typeColor(card.type)(card.type)} ${c.dim('·')} ${prioColor(card.priority)('P:' + card.priority)}`)
  if (card.assignee) console.log(`  resp: ${c.dim(card.assignee)}`)
  if (card.due_date) console.log(`  due:  ${c.dim(card.due_date)}`)
  console.log()

  console.log(section('Localizacao'))
  console.log(`  workspace ${c.bold(ws?.name || '?')} ${c.dim('#' + (ws?.slug || '?'))}`)
  console.log(`  coluna    ${c.bold(col?.name || '?')} ${c.dim('#' + (col?.slug || '?'))}`)
  if (proj) console.log(`  projeto   ${c.bold(proj.name)} ${c.dim(proj.path.replace(/^\/Users\/[^/]+\//, '~/'))}`)
  console.log()

  // Pipeline status
  console.log(section('Pipeline'))
  const stages = [
    ['Detalhes', !!card.title],
    ['Entrevista', !!card.interview_notes?.trim()],
    ['Spec', !!card.spec_content?.trim(), card.spec_status],
    ['Implementar', card.spec_status === 'done' || card.spec_status === 'review' || card.spec_status === 'in_progress', undefined as string | undefined],
  ] as const
  stages.forEach(([label, done, hint], i) => {
    const led = done ? sym.ok : sym.idle
    const hintText = hint ? c.dim(' · ' + hint) : ''
    console.log(`  ${c.dim(`[${i + 1}]`)} ${led} ${done ? c.bold(label as string) : c.dim(label as string)}${hintText}`)
  })
  console.log()

  // Description
  if (card.description?.trim()) {
    console.log(section('Descricao'))
    const cleaned = card.description.trim().split('\n').slice(0, 8).join('\n')
    console.log(cleaned.split('\n').map((l) => '  ' + c.dim(l)).join('\n'))
    if (card.description.split('\n').length > 8) {
      console.log(c.dim('  …(' + (card.description.split('\n').length - 8) + ' linhas)'))
    }
    console.log()
  }

  // Spec preview
  if (card.spec_content?.trim()) {
    console.log(section(`Spec · ${card.spec_status || 'draft'}`))
    const preview = card.spec_content.split('\n').slice(0, 6).join('\n')
    console.log(preview.split('\n').map((l) => '  ' + l).join('\n'))
    if (card.spec_content.split('\n').length > 6) {
      console.log(c.dim('  …(use cockpit spec show #' + shortId(card.id) + ' para ver tudo)'))
    }
    console.log()
  }

  // Last session summary
  if (session) {
    console.log(section('Ultima execucao'))
    console.log(`  ${c.dim('action')}    ${c.bold(session.action)}`)
    console.log(`  ${c.dim('agent')}     ${session.agent}${session.model ? c.dim('/' + session.model) : ''}`)
    console.log(`  ${c.dim('phase')}     ${phaseColor(session.phase)(session.phase)}`)
    console.log(`  ${c.dim('chunks')}    ${c.bold(String((session.chunks || []).length))}`)
    if (session.duration) console.log(`  ${c.dim('duration')}  ${session.duration}s`)
    if (session.error) console.log(`  ${c.dim('error')}     ${c.rose(session.error.slice(0, 70))}`)
    console.log()
  }

  // Hints
  console.log(c.dim('  ━ acoes:'))
  console.log(c.dim('    cockpit watch #' + shortId(card.id) + '       acompanha live'))
  console.log(c.dim('    cockpit log #' + shortId(card.id) + '         ultimo log'))
  console.log(c.dim('    cockpit implement #' + shortId(card.id) + '   re-implementar'))
}

// ── helpers ──

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function typeColor(t: string): (s: string) => string {
  switch (t) {
    case 'feature': return c.blue
    case 'bugfix': return c.rose
    case 'hotfix': return c.amber
    case 'discovery': return c.magenta
    case 'improvement': return c.emerald
    default: return c.gray
  }
}

function prioColor(p: string): (s: string) => string {
  switch (p) {
    case 'critical': return c.rose
    case 'high': return c.amber
    case 'medium': return c.yellow
    case 'low': return c.emerald
    default: return c.gray
  }
}

function phaseColor(p: string): (s: string) => string {
  if (p === 'done') return c.emerald
  if (p === 'error') return c.rose
  return c.amber
}

// ── Tier 2: write commands ──

interface NewOpts {
  type?: string
  priority?: string
  ws?: string
  col?: string
  description?: string
}

const VALID_TYPES = ['feature', 'bugfix', 'hotfix', 'discovery', 'chore', 'improvement']
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low']

export async function cardNew(title: string, opts: NewOpts = {}): Promise<void> {
  if (!title || title.trim().length === 0) {
    console.error(c.rose('✕ titulo obrigatorio'))
    console.log(c.dim('  uso: cockpit card new "Titulo do card"'))
    process.exit(1)
  }

  const { workspaces, columns } = await loadAll()
  const cli = await readConfigAsync()

  const ws = opts.ws
    ? resolveWorkspace(opts.ws, workspaces)
    : workspaces.find((w) => w.slug === cli.activeWorkspaceSlug)
  if (!ws) {
    console.error(c.rose('✕ workspace ativo nao definido'))
    console.log(c.dim('  use: cockpit ws use <name> ou --ws <name>'))
    process.exit(1)
  }

  // Type/priority validation
  const type = (opts.type || 'feature').toLowerCase()
  if (!VALID_TYPES.includes(type)) {
    console.error(c.rose('✕ tipo invalido: ' + type))
    console.log(c.dim('  validos: ' + VALID_TYPES.join(', ')))
    process.exit(1)
  }
  const priority = (opts.priority || 'medium').toLowerCase()
  if (!VALID_PRIORITIES.includes(priority)) {
    console.error(c.rose('✕ prioridade invalida: ' + priority))
    console.log(c.dim('  validas: ' + VALID_PRIORITIES.join(', ')))
    process.exit(1)
  }

  // Column resolution: --col <slug>, ou primeira coluna
  const wsCols = (columns[ws.id] || []).sort((a, b) => a.position - b.position)
  if (wsCols.length === 0) {
    console.error(c.rose('✕ workspace nao tem colunas'))
    process.exit(1)
  }
  let column = wsCols[0]
  if (opts.col) {
    const found = wsCols.find((co) => co.slug === opts.col || co.name.toLowerCase() === opts.col!.toLowerCase())
    if (!found) {
      console.error(c.rose('✕ coluna nao encontrada: ' + opts.col))
      console.log(c.dim('  disponiveis: ' + wsCols.map((co) => co.slug).join(', ')))
      process.exit(1)
    }
    column = found
  }

  const cardId = newCardId()
  const now = new Date().toISOString()
  const newCard = {
    id: cardId,
    workspace_id: ws.id,
    column_id: column.id,
    project_id: null,
    title: title.trim(),
    description: opts.description?.trim() || null,
    type,
    priority,
    position: 0,
    assignee: null,
    due_date: null,
    spec_status: null,
    spec_content: null,
    interview_notes: null,
    created_at: now,
    updated_at: now,
    labels: [],
  }

  await addCard(newCard as never)
  console.log(`${c.emerald('✓')} card #${shortId(cardId)} criado`)
  console.log(`  ${c.dim('em')} ${c.bold(ws.name)}/${column.slug} ${c.dim('· ' + type + ' · P:' + priority)}`)
  console.log(`  ${c.dim('cockpit card show #' + shortId(cardId))}`)
}

export async function cardMove(ref: string, columnSlug: string): Promise<void> {
  const { workspaces, cards, columns } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card nao encontrado: ') + ref)
    process.exit(1)
  }

  const wsCols = (columns[card.workspace_id] || []).sort((a, b) => a.position - b.position)
  const target = wsCols.find((co) => co.slug === columnSlug || co.name.toLowerCase() === columnSlug.toLowerCase())
  if (!target) {
    console.error(c.rose('✕ coluna nao encontrada: ') + columnSlug)
    console.log(c.dim('  disponiveis: ' + wsCols.map((co) => co.slug).join(', ')))
    process.exit(1)
  }

  await moveCardToColumn(card.id, target.id)
  const ws = workspaces.find((w) => w.id === card.workspace_id)
  console.log(`${c.emerald('✓')} #${shortId(card.id)} movido para ${c.bold(target.name)} ${c.dim('em ' + (ws?.name || ''))}`)
}

export async function cardDelete(ref: string, force = false): Promise<void> {
  const { cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card nao encontrado: ') + ref)
    process.exit(1)
  }

  if (!force) {
    console.log(c.amber('⚠ vai excluir #' + shortId(card.id) + ': ') + c.bold(card.title))
    console.log(c.dim('  use --force para confirmar (nao tem undo)'))
    process.exit(0)
  }

  await deleteCard(card.id)
  console.log(`${c.emerald('✓')} #${shortId(card.id)} excluido`)
}

interface EditOpts {
  title?: string
  type?: string
  priority?: string
  assignee?: string
  due?: string
}

export async function cardEdit(ref: string, opts: EditOpts): Promise<void> {
  const { cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card nao encontrado: ') + ref)
    process.exit(1)
  }

  const patch: Record<string, unknown> = {}
  if (opts.title) patch.title = opts.title
  if (opts.type) {
    if (!VALID_TYPES.includes(opts.type)) {
      console.error(c.rose('✕ tipo invalido: ' + opts.type))
      process.exit(1)
    }
    patch.type = opts.type
  }
  if (opts.priority) {
    if (!VALID_PRIORITIES.includes(opts.priority)) {
      console.error(c.rose('✕ prioridade invalida: ' + opts.priority))
      process.exit(1)
    }
    patch.priority = opts.priority
  }
  if (opts.assignee !== undefined) patch.assignee = opts.assignee || null
  if (opts.due !== undefined) patch.due_date = opts.due || null

  if (Object.keys(patch).length === 0) {
    console.log(c.dim('nada a atualizar. flags: --title --type --priority --assignee --due'))
    return
  }

  await updateCard(card.id, patch as never)
  console.log(`${c.emerald('✓')} #${shortId(card.id)} atualizado`)
  for (const [k, v] of Object.entries(patch)) {
    console.log(`  ${c.dim(k)}: ${String(v)}`)
  }
}
