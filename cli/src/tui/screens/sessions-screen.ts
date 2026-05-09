// Sessions screen — lista todas as sessions running, atualizada por tick.
// Setas movem seleção, enter abre detalhe da session (live tail).

import type { Screen, KeyResult } from '../engine'
import type { Key } from '../keys'
import { c } from '../../ui/colors'
import { padRight, clip } from '../layout'
import { api, rawFetch } from '../../api/client'
import type { AgentSession, Card } from '../../api/client'
import { loadAll } from '../../api/store'
import { SessionTailScreen } from './session-tail-screen'

export class SessionsScreen implements Screen {
  name = 'sessions'

  private sessions: AgentSession[] = []
  private cardsById: Map<string, Card> = new Map()
  private selected = 0
  private err: string | null = null
  private lastFetch = 0

  async onEnter(): Promise<void> {
    await this.refresh()
  }

  async tick(): Promise<void> {
    // Refresh a cada ~3s
    if (Date.now() - this.lastFetch > 3000) {
      await this.refresh()
    }
  }

  async refresh(): Promise<void> {
    try {
      const r = await api.listRunningSessions()
      this.sessions = r.sessions
      const all = await loadAll()
      this.cardsById = new Map(all.cards.map((c) => [c.id, c]))
      this.err = null
      this.lastFetch = Date.now()
      if (this.selected >= this.sessions.length) {
        this.selected = Math.max(0, this.sessions.length - 1)
      }
    } catch (err) {
      this.err = (err as Error).message
    }
  }

  async onKey(key: Key): Promise<KeyResult> {
    if (key.name === 'q' || key.name === 'escape' || key.name === 'tab' || key.name === 'backspace') {
      return { kind: 'pop' }
    }
    if (key.name === 'r') {
      await this.refresh()
      return { kind: 'consumed' }
    }
    if (key.name === 'up' || key.name === 'k') {
      if (this.selected > 0) this.selected--
      return { kind: 'consumed' }
    }
    if (key.name === 'down' || key.name === 'j') {
      if (this.selected < this.sessions.length - 1) this.selected++
      return { kind: 'consumed' }
    }
    if (key.name === 'enter') {
      const session = this.sessions[this.selected]
      if (session) {
        return { kind: 'push', screen: new SessionTailScreen(session.id, session.cardId) }
      }
    }
    if (key.name === 'x') {
      const session = this.sessions[this.selected]
      if (session) {
        try {
          await rawFetch(`/agents/sessions/${session.id}/abort`, { method: 'POST' })
          await this.refresh()
        } catch { /* ignore */ }
      }
      return { kind: 'consumed' }
    }
    return { kind: 'consumed' }
  }

  render(width: number, height: number): string {
    const lines: string[] = []
    lines.push(`  ${c.bold('▰▰▰')} ${c.bold('SESSIONS RUNNING')}  ${c.dim('· ' + this.sessions.length + ' active')}`)
    lines.push(c.dim('━'.repeat(width - 1)))

    if (this.err) {
      lines.push('')
      lines.push(`  ${c.rose('✕')} ${this.err}`)
    } else if (this.sessions.length === 0) {
      lines.push('')
      lines.push(c.dim('  Nenhuma session running.'))
      lines.push('')
      lines.push(c.dim('  Dispare uma com:'))
      lines.push(`    ${c.bold('cockpit implement <id>')}     ${c.dim('# CLI direto')}`)
      lines.push(`    ${c.bold('cockpit_implement_async')}    ${c.dim('# MCP no Claude Code')}`)
    } else {
      // Table-like list
      this.sessions.forEach((s, i) => {
        const card = this.cardsById.get(s.cardId)
        const cardTitle = card ? clip(card.title, width - 50) : '(sem card)'
        const shortId = s.cardId.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
        const elapsed = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000)
        const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m${elapsed % 60}s`
        const sel = i === this.selected
        const phaseStr = phaseColor(s.phase)(padRight(s.phase, 12))
        const lineMain = `${c.dim('#' + shortId)} ${phaseStr} ${c.dim(s.action.padEnd(14))} ${c.dim('@')} ${s.agent}${s.model ? c.dim('/' + s.model) : ''} ${c.dim('· ' + elapsedStr)}`
        const lineTitle = `   ${c.dim(cardTitle)}`
        if (sel) {
          lines.push(`  ${c.cyan('▸')} ${lineMain}`)
          lines.push(`  ${c.cyan(' ')} ${lineTitle}`)
        } else {
          lines.push(`    ${lineMain}`)
          lines.push(`    ${lineTitle}`)
        }
      })
    }

    while (lines.length < height - 1) lines.push('')
    const footer = `${c.dim('↑/↓')} navegar · ${c.dim('enter')} live tail · ${c.dim('x')} abortar · ${c.dim('r')} refresh · ${c.dim('tab/esc')} voltar · ${c.dim('q')} sair`
    lines[height - 1] = clip(' ' + footer, width - 1)
    return lines.join('\n')
  }
}

function phaseColor(p: string): (s: string) => string {
  if (p === 'done') return c.emerald
  if (p === 'error') return c.rose
  return c.amber
}
