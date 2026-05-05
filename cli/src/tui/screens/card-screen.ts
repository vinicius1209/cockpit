// Card detail screen — visualiza card completo + tabs (details/spec/interview/sessions).
// 1/2/3/4 troca tab; esc volta; a archive; i implement (sai do TUI e dispara CLI).

import type { Screen, KeyResult } from '../engine'
import type { Key } from '../keys'
import { c } from '../../ui/colors'
import { padRight, clip } from '../layout'
import { loadAll } from '../../api/store'
import { api } from '../../api/client'
import type { Card, Workspace, AgentSession } from '../../api/client'

type Tab = 'details' | 'spec' | 'interview' | 'sessions'
const TABS: Array<{ id: Tab; label: string; key: string }> = [
  { id: 'details', label: 'DETALHES', key: '1' },
  { id: 'spec', label: 'SPEC', key: '2' },
  { id: 'interview', label: 'ENTREVISTA', key: '3' },
  { id: 'sessions', label: 'SESSIONS', key: '4' },
]

export class CardScreen implements Screen {
  name = 'card'
  private card: Card | null = null
  private ws: Workspace | null = null
  private sessions: AgentSession[] = []
  private tab: Tab = 'details'
  private err: string | null = null
  private scroll = 0

  constructor(private cardId: string, private onChange: () => void | Promise<void>) {}

  async onEnter(): Promise<void> {
    await this.refresh()
  }

  async refresh(): Promise<void> {
    try {
      const all = await loadAll()
      const card = all.cards.find((c) => c.id === this.cardId)
      if (!card) {
        this.err = 'card nao encontrado (foi excluido?)'
        return
      }
      this.card = card
      this.ws = all.workspaces.find((w) => w.id === card.workspace_id) || null

      // Pega sessions do card
      try {
        const all = await api.listRunningSessions()
        this.sessions = all.sessions.filter((s) => s.cardId === card.id)
      } catch { this.sessions = [] }
    } catch (err) {
      this.err = (err as Error).message
    }
  }

  async onKey(key: Key): Promise<KeyResult> {
    if (key.name === 'escape' || key.name === 'q' || key.name === 'backspace') return { kind: 'pop' }

    for (const t of TABS) {
      if (key.name === t.key) {
        this.tab = t.id
        this.scroll = 0
        return { kind: 'consumed' }
      }
    }

    if (key.name === 'r') {
      await this.refresh()
      return { kind: 'consumed' }
    }

    if (key.name === 'down' || key.name === 'j') {
      this.scroll++
      return { kind: 'consumed' }
    }
    if (key.name === 'up' || key.name === 'k') {
      this.scroll = Math.max(0, this.scroll - 1)
      return { kind: 'consumed' }
    }
    if (key.name === 'pagedown') {
      this.scroll += 10
      return { kind: 'consumed' }
    }
    if (key.name === 'pageup') {
      this.scroll = Math.max(0, this.scroll - 10)
      return { kind: 'consumed' }
    }

    if (key.name === 'a' && this.card) {
      // archive/unarchive (sem confirm — TUI atalho power-user)
      const { archiveCard, unarchiveCard } = await import('../../api/store').then((m) => ({
        archiveCard: m.updateCard,
        unarchiveCard: m.updateCard,
      }))
      const isArchived = !!this.card.archived_at
      // updateCard signature: (id, fields)
      // archived_at is a Card field — type allows it
      void archiveCard
      void unarchiveCard
      const { updateCard } = await import('../../api/store')
      await updateCard(this.card.id, {
        archived_at: isArchived ? null : new Date().toISOString(),
      } as never)
      await this.refresh()
      await this.onChange()
      return { kind: 'consumed' }
    }

    return { kind: 'consumed' }
  }

  render(width: number, height: number): string {
    if (this.err) return `\n  ${c.rose('✕')} ${this.err}\n  ${c.dim('esc volta')}`
    if (!this.card) return `\n  ${c.dim('carregando...')}`

    const lines: string[] = []
    const card = this.card
    const ws = this.ws

    // Flight strip header
    const shortId = card.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
    const archivedTag = card.archived_at ? c.amber(' [DESCARTADO]') : ''
    lines.push(
      `  ${c.dim('CARD')} ${c.bold('#' + shortId)} ${c.dim('·')} ${typeColorFn(card.type)(card.type.toUpperCase())} ${c.dim('·')} ${prioColorFn(card.priority)('P:' + card.priority.toUpperCase())}` +
      `${archivedTag}` +
      (ws ? `  ${c.dim('· ws ' + ws.slug)}` : '')
    )
    lines.push(`  ${c.bold(clip(card.title, width - 4))}`)
    lines.push(c.dim('━'.repeat(width - 1)))

    // Tabs
    const tabsLine = TABS.map((t) => {
      const active = t.id === this.tab
      const txt = `[${t.key}] ${t.label}`
      return active ? c.cyan(c.bold(txt)) : c.dim(txt)
    }).join('   ')
    lines.push('  ' + tabsLine)
    lines.push(c.dim('─'.repeat(width - 1)))

    // Body
    const body = this.renderBody(width - 4)
    const visible = body.slice(this.scroll, this.scroll + (height - 8))
    for (const l of visible) lines.push('  ' + l)

    // Footer
    while (lines.length < height - 1) lines.push('')
    const footer = `${c.dim('1/2/3/4')} tab · ${c.dim('↑/↓')} scroll · ${c.dim('a')} ${card.archived_at ? 'reativar' : 'descartar'} · ${c.dim('r')} refresh · ${c.dim('esc')} voltar`
    lines[height - 1] = clip(' ' + footer, width - 1)

    return lines.join('\n')
  }

  private renderBody(w: number): string[] {
    if (!this.card) return []
    const card = this.card

    if (this.tab === 'details') {
      const out: string[] = []
      out.push(c.dim('━ DESCRICAO'))
      out.push('')
      if (card.description?.trim()) {
        for (const line of card.description.split('\n')) {
          out.push(...wrap(line, w))
        }
      } else {
        out.push(c.dim('(sem descricao)'))
      }
      out.push('')
      out.push(c.dim('━ METADATA'))
      out.push(`  ${c.dim('id        ')} ${card.id}`)
      out.push(`  ${c.dim('criado    ')} ${card.created_at}`)
      out.push(`  ${c.dim('atualizado')} ${card.updated_at}`)
      if (card.assignee) out.push(`  ${c.dim('assignee  ')} ${card.assignee}`)
      if (card.due_date) out.push(`  ${c.dim('due       ')} ${card.due_date}`)
      if (card.archived_at) out.push(`  ${c.dim('archived  ')} ${c.amber(card.archived_at)}`)
      return out
    }

    if (this.tab === 'spec') {
      const out: string[] = []
      const status = card.spec_status || 'draft'
      out.push(`${c.dim('status:')} ${specStatusColor(status)(status)}`)
      out.push('')
      if (card.spec_content?.trim()) {
        for (const line of card.spec_content.split('\n')) {
          out.push(...wrap(line, w))
        }
      } else {
        out.push(c.dim('(spec vazia — gere com cockpit spec gen ' + card.id.slice(-4).toUpperCase() + ')'))
      }
      return out
    }

    if (this.tab === 'interview') {
      const out: string[] = []
      if (card.interview_notes?.trim()) {
        for (const line of card.interview_notes.split('\n')) {
          out.push(...wrap(line, w))
        }
      } else {
        out.push(c.dim('(sem entrevista)'))
      }
      return out
    }

    if (this.tab === 'sessions') {
      const out: string[] = []
      if (this.sessions.length === 0) {
        out.push(c.dim('(nenhuma session ativa)'))
        out.push('')
        out.push(c.dim('use: cockpit log ' + card.id.slice(-4).toUpperCase() + ' (historico)'))
        return out
      }
      for (const s of this.sessions) {
        out.push(`${c.amber('●')} ${c.bold(s.action)} ${c.dim('agent:')} ${s.agent}${s.model ? c.dim('/' + s.model) : ''}`)
        out.push(`  ${c.dim('phase')}    ${phaseColor(s.phase)(s.phase)}`)
        out.push(`  ${c.dim('started')}  ${s.startedAt}`)
        out.push(`  ${c.dim('chunks')}   ${(s.chunks || []).length}`)
        out.push('')
      }
      return out
    }

    return []
  }
}

function wrap(line: string, w: number): string[] {
  if (line.length <= w) return [line]
  const out: string[] = []
  let s = line
  while (s.length > w) {
    out.push(s.slice(0, w))
    s = s.slice(w)
  }
  if (s) out.push(s)
  return out
}

function typeColorFn(t: string): (s: string) => string {
  switch (t) {
    case 'feature': return c.blue
    case 'bugfix': return c.rose
    case 'hotfix': return c.amber
    case 'discovery': return c.magenta
    case 'improvement': return c.emerald
    default: return c.gray
  }
}

function prioColorFn(p: string): (s: string) => string {
  switch (p) {
    case 'critical': return c.rose
    case 'high': return c.amber
    case 'medium': return c.yellow
    case 'low': return c.emerald
    default: return c.gray
  }
}

function specStatusColor(s: string): (x: string) => string {
  switch (s) {
    case 'ready': case 'done': return c.emerald
    case 'in_progress': case 'review': return c.amber
    default: return c.gray
  }
}

function phaseColor(p: string): (x: string) => string {
  if (p === 'done') return c.emerald
  if (p === 'error') return c.rose
  return c.amber
}

void padRight
