import { loadAll } from '../api/store'
import { resolveCard, shortId } from '../api/resolve'
import { c } from '../ui/colors'
import { divider, section } from '../ui/box'
import { table } from '../ui/table'
import { api, rawFetch } from '../api/client'

interface LogOpts {
  last?: number
  asJson?: boolean
}

interface SessionRow {
  id: string
  attempt?: number
  phase: string
  agent: string
  branch?: string | null
  duration?: number | null
  completedAt?: string | null
  exitCode?: number | null
  feedback?: string | null
}

export async function log(ref: string, opts: LogOpts = {}): Promise<void> {
  const { workspaces, cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }
  const ws = workspaces.find((w) => w.id === card.workspace_id)
  if (!ws) {
    console.error(c.rose('✕ workspace não encontrado'))
    process.exit(1)
  }

  // Pega lista de sessions legadas (implement) via rota antiga
  const sessions = await fetchSessions(ws.slug, card.id)
  if (sessions.length === 0) {
    console.log(c.dim('nenhuma session registrada para este card.'))
    return
  }

  if (opts.asJson) {
    console.log(JSON.stringify(sessions, null, 2))
    return
  }

  console.log(divider(`SESSIONS · #${shortId(card.id)}`, 'gray'))
  console.log(c.dim('  ' + card.title))
  console.log()

  const limit = opts.last || sessions.length
  const recent = sessions.slice(0, limit)

  const rows = recent.map((s, i) => ({
    n: c.dim(String(i + 1).padStart(2, '0')),
    attempt: c.dim('try' + (s.attempt || 1)),
    phase: phaseDot(s.phase) + ' ' + s.phase,
    exit: s.exitCode === 0 ? c.emerald('0') : s.exitCode != null ? c.rose(String(s.exitCode)) : c.dim('—'),
    duration: s.duration != null ? c.bold(`${s.duration}s`) : c.dim('—'),
    agent: c.dim(s.agent),
    when: s.completedAt ? c.dim(formatRelative(new Date(s.completedAt))) : c.amber('running'),
  }))

  console.log(table(rows, [
    { key: 'n', label: '#' },
    { key: 'attempt', label: 'try' },
    { key: 'phase', label: 'phase' },
    { key: 'exit', label: 'exit', align: 'right' },
    { key: 'duration', label: 'dur', align: 'right' },
    { key: 'agent', label: 'agent' },
    { key: 'when', label: 'when' },
  ]))

  // Se tem feedback ou erro nas mais recentes, mostrar
  const withDetail = recent.filter((s) => s.feedback || (s.phase === 'error'))
  if (withDetail.length > 0) {
    console.log()
    console.log(section('Detalhes'))
    for (const s of withDetail.slice(0, 3)) {
      const id = '#' + s.id.slice(-8)
      console.log(`  ${c.dim(id)}`)
      if (s.feedback) console.log(`    ${c.amber('feedback:')} ${truncate(s.feedback, 100)}`)
    }
  }

  console.log()
  console.log(c.dim(`  use ${c.bold('cockpit watch #' + shortId(card.id))} para tail da última`))
}

async function fetchSessions(wsSlug: string, cardId: string): Promise<SessionRow[]> {
  // GET /api/tasks/<ws>/<card>/sessions retorna array das sessions persistidas
  const res = await rawFetch(`/api/tasks/${encodeURIComponent(wsSlug)}/${encodeURIComponent(cardId)}/sessions`)
  if (!res.ok) return []
  const data = await res.json() as SessionRow[]
  return Array.isArray(data) ? data.reverse() : []
}

function phaseDot(p: string): string {
  if (p === 'done') return c.emerald('●')
  if (p === 'error') return c.rose('●')
  return c.amber('●')
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d atrás`
  return d.toLocaleDateString('pt-BR')
}

void api  // suppress unused warning when only rawFetch used
