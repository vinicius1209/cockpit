// Board screen — kanban interativo. Setas movem selecao, enter abre detalhe,
// q quit, tab vai pra sessions, / busca, w troca workspace, r refresh.

import type { Screen, KeyResult } from '../engine'
import type { Key } from '../keys'
import { c } from '../../ui/colors'
import { padRight, clip, center, visibleLength } from '../layout'
import { loadAll } from '../../api/store'
import { api } from '../../api/client'
import type { Card, Workspace, BoardColumn } from '../../api/client'
import { readConfigAsync, writeConfig } from '../../config/daemon'
import { CardScreen } from './card-screen'
import { SessionsScreen } from './sessions-screen'
import { WorkspacePickerScreen } from './workspace-picker-screen'

interface BoardData {
  workspaces: Workspace[]
  cards: Card[]
  columns: Record<string, BoardColumn[]>
  liveSessions: Set<string>
}

export class BoardScreen implements Screen {
  name = 'board'

  private data: BoardData | null = null
  private err: string | null = null
  private activeWsSlug: string | null = null
  private selectedCol = 0
  private selectedCard = 0
  private includeArchived = false

  async onEnter(): Promise<void> {
    await this.refresh()
  }

  async refresh(): Promise<void> {
    try {
      const cfg = await readConfigAsync()
      const all = await loadAll()
      let liveSessions = new Set<string>()
      try {
        const r = await api.listRunningSessions()
        liveSessions = new Set(r.sessions.map((s) => s.cardId))
      } catch { /* ok */ }

      this.data = {
        workspaces: all.workspaces,
        cards: all.cards,
        columns: all.columns,
        liveSessions,
      }
      this.err = null

      // Resolve active ws: cli config OR first
      this.activeWsSlug = cfg.activeWorkspaceSlug || all.workspaces[0]?.slug || null
      this.clampSelection()
    } catch (err) {
      this.err = (err as Error).message
    }
  }

  private clampSelection(): void {
    if (!this.data || !this.activeWsSlug) return
    const ws = this.data.workspaces.find((w) => w.slug === this.activeWsSlug)
    if (!ws) return
    const cols = this.data.columns[ws.id] || []
    if (cols.length === 0) return
    if (this.selectedCol >= cols.length) this.selectedCol = cols.length - 1
    if (this.selectedCol < 0) this.selectedCol = 0
    const cards = this.cardsInColumn(ws.id, cols[this.selectedCol].id)
    if (this.selectedCard >= cards.length) this.selectedCard = Math.max(0, cards.length - 1)
    if (this.selectedCard < 0) this.selectedCard = 0
  }

  private cardsInColumn(wsId: string, colId: string): Card[] {
    if (!this.data) return []
    return this.data.cards
      .filter((card) =>
        card.workspace_id === wsId
        && card.column_id === colId
        && (this.includeArchived || !card.archived_at),
      )
      .sort((a, b) => a.position - b.position)
  }

  async onKey(key: Key): Promise<KeyResult> {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) return { kind: 'quit' }

    if (key.name === 'r') {
      await this.refresh()
      return { kind: 'consumed' }
    }

    if (key.name === 'tab') {
      return { kind: 'push', screen: new SessionsScreen() }
    }

    if (key.name === 'w') {
      return { kind: 'push', screen: new WorkspacePickerScreen(async (slug) => {
        await writeConfig({ activeWorkspaceSlug: slug })
        this.activeWsSlug = slug
        this.selectedCol = 0
        this.selectedCard = 0
      }) }
    }

    if (key.name === 'a') {
      this.includeArchived = !this.includeArchived
      this.clampSelection()
      return { kind: 'consumed' }
    }

    if (!this.data || !this.activeWsSlug) return { kind: 'consumed' }
    const ws = this.data.workspaces.find((w) => w.slug === this.activeWsSlug)
    if (!ws) return { kind: 'consumed' }
    const cols = this.data.columns[ws.id] || []
    if (cols.length === 0) return { kind: 'consumed' }

    if (key.name === 'left') {
      if (this.selectedCol > 0) {
        this.selectedCol--
        this.selectedCard = 0
        this.clampSelection()
      }
      return { kind: 'consumed' }
    }
    if (key.name === 'right') {
      if (this.selectedCol < cols.length - 1) {
        this.selectedCol++
        this.selectedCard = 0
        this.clampSelection()
      }
      return { kind: 'consumed' }
    }
    if (key.name === 'up') {
      if (this.selectedCard > 0) this.selectedCard--
      return { kind: 'consumed' }
    }
    if (key.name === 'down') {
      const cards = this.cardsInColumn(ws.id, cols[this.selectedCol].id)
      if (this.selectedCard < cards.length - 1) this.selectedCard++
      return { kind: 'consumed' }
    }

    if (key.name === 'enter') {
      const cards = this.cardsInColumn(ws.id, cols[this.selectedCol].id)
      const card = cards[this.selectedCard]
      if (card) {
        return { kind: 'push', screen: new CardScreen(card.id, () => this.refresh()) }
      }
    }

    return { kind: 'consumed' }
  }

  render(width: number, height: number): string {
    if (this.err) {
      return `\n  ${c.rose('✕ erro:')} ${this.err}\n  ${c.dim('q sai · r retry')}`
    }
    if (!this.data) {
      return `\n  ${c.dim('carregando...')}`
    }

    const ws = this.data.workspaces.find((w) => w.slug === this.activeWsSlug)
    if (!ws) {
      return `\n  ${c.dim('nenhum workspace. Crie um pelo Web UI ou cockpit ws new.')}`
    }

    const cols = this.data.columns[ws.id] || []
    if (cols.length === 0) {
      return `\n  ${c.dim('workspace sem colunas')}`
    }

    const lines: string[] = []

    // Top header
    const totalCards = this.data.cards.filter((c) => c.workspace_id === ws.id).length
    const wsCards = totalCards
    const archivedCount = this.data.cards.filter((c) => c.workspace_id === ws.id && c.archived_at).length
    const liveCount = Array.from(this.data.liveSessions).filter((cid) =>
      this.data!.cards.find((card) => card.id === cid)?.workspace_id === ws.id,
    ).length

    const headerLeft = `${c.bold('▰▰▰')} ${c.bold('COCKPIT')} ${c.dim('· tui')}`
    const headerRight = `ws: ${c.bold(ws.name)} ${c.dim('#' + ws.slug)}  ·  ${c.amber(String(liveCount) + ' live')}  ·  ${wsCards} cards${archivedCount > 0 ? c.dim(` (${archivedCount} archived)`) : ''}`
    lines.push(padRight(headerLeft, Math.floor(width / 2)) + padRight(headerRight, width - Math.floor(width / 2) - 1))
    lines.push(c.dim('━'.repeat(width - 1)))

    // Compute column width — fit all in screen
    const gap = 2
    const colWidth = Math.max(20, Math.floor((width - cols.length * gap - 2) / cols.length))

    // Each column: header + cards + selection highlight
    const columnContent: string[][] = cols.map((col, ci) => {
      const cards = this.cardsInColumn(ws.id, col.id)
      const colHeader = `${c.dim(`[${String(ci + 1).padStart(2, '0')}]`)} ${c.bold(col.name.toUpperCase())}  ${c.dim(String(cards.length))}`
      const sel = ci === this.selectedCol
      const colHeadStyled = sel ? c.cyan(c.bold(`▸ ${col.name.toUpperCase()} ${c.dim(String(cards.length))}`)) : colHeader
      const cardLines: string[] = []
      cardLines.push(clip(colHeadStyled, colWidth))
      cardLines.push(c.dim('─'.repeat(colWidth)))
      if (cards.length === 0) {
        cardLines.push(c.dim('(vazio)'))
      } else {
        cards.forEach((card, ki) => {
          const isSel = sel && ki === this.selectedCard
          const lines = this.renderCard(card, colWidth, isSel)
          cardLines.push(...lines)
        })
      }
      return cardLines
    })

    // Pad columns to same height
    const maxH = Math.max(...columnContent.map((c) => c.length))
    columnContent.forEach((col) => {
      while (col.length < maxH) col.push(' '.repeat(colWidth))
    })

    // Compose row by row
    const availableRows = height - 4 // header (2) + footer (1) + padding
    for (let r = 0; r < Math.min(maxH, availableRows); r++) {
      const row = columnContent.map((col) => padRight(col[r] || '', colWidth)).join(' '.repeat(gap))
      lines.push(row)
    }
    while (lines.length < height - 1) lines.push('')

    // Footer status bar
    const footer = this.renderFooter(width)
    lines[height - 1] = footer

    return lines.join('\n')
  }

  private renderCard(card: Card, width: number, selected: boolean): string[] {
    const isLive = this.data!.liveSessions.has(card.id)
    const shortId = card.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
    const typeColor = typeColorFn(card.type)
    const prioColor = prioColorFn(card.priority)

    const archived = !!card.archived_at
    const meta = `${typeColor(card.type.slice(0, 4).toUpperCase())} ${prioColor('P:' + card.priority.slice(0, 3))}${isLive ? c.amber(' LIVE') : ''}${archived ? c.amber(' ARC') : ''}`
    const idLabel = c.dim('#' + shortId)

    const titleMaxW = Math.max(8, width - 2)
    const titleClipped = clip(card.title, titleMaxW)

    let line1 = `${idLabel} ${meta}`
    let line2 = `  ${archived ? c.dim(titleClipped) : titleClipped}`

    if (selected) {
      line1 = c.cyan('▸ ') + line1
      line2 = c.cyan('  ') + line2
    } else {
      line1 = '  ' + line1
    }
    return [clip(line1, width), clip(line2, width)]
  }

  private renderFooter(width: number): string {
    const archived = this.includeArchived ? c.amber('a:archived ON') : c.dim('a:archived')
    const hints = [
      `${c.dim('←/→')} ${c.bold('coluna')}`,
      `${c.dim('↑/↓')} ${c.bold('card')}`,
      `${c.dim('enter')} ${c.bold('abrir')}`,
      `${c.dim('w')} ${c.bold('workspace')}`,
      `${c.dim('tab')} ${c.bold('sessions')}`,
      archived,
      `${c.dim('r')} ${c.bold('refresh')}`,
      `${c.dim('q')} ${c.bold('sair')}`,
    ]
    const text = hints.join(c.dim(' · '))
    return clip(' ' + text, width - 1)
  }
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

function visibleLengthUnused(s: string): number { return s.length }
void visibleLengthUnused
void visibleLength
