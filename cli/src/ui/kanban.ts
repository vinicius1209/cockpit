import type { Card, BoardColumn } from '../api/client'
import { c, visibleLength } from './colors'
import { shortId } from '../api/resolve'

const TYPE_COLOR: Record<string, (s: string) => string> = {
  feature: c.blue,
  bugfix: c.rose,
  hotfix: c.amber,
  discovery: c.magenta,
  chore: c.gray,
  improvement: c.emerald,
}

const PRIO_COLOR: Record<string, (s: string) => string> = {
  critical: c.rose,
  high: c.amber,
  medium: c.yellow,
  low: c.emerald,
}

interface KanbanOpts {
  columns: BoardColumn[]
  cards: Card[]
  /** processingCardIds vivos no daemon — destaca como LIVE */
  liveCardIds?: Set<string>
  /** Largura por coluna em chars (default: auto-calc) */
  columnWidth?: number
}

const COL_W = 28

// Renderiza ASCII kanban no terminal.
// Cada coluna virtualmente "empilhada" lado a lado em chunks de COL_W.
// Trunca cards longos para caber.
export function kanban(opts: KanbanOpts): string {
  const { columns, cards, liveCardIds = new Set() } = opts
  const W = opts.columnWidth || COL_W

  // Sort columns by position
  const cols = [...columns].sort((a, b) => a.position - b.position)

  // Header
  const headers = cols.map((col) => {
    const cnt = cards.filter((c) => c.column_id === col.id).length
    const dot = colorDot(col.color)
    const title = ` ${dot} ${c.bold(col.name)} ${c.dim(String(cnt).padStart(2, '0'))}`
    return pad(title, W)
  })

  const cardsByColumn = cols.map((col) => {
    return cards
      .filter((c) => c.column_id === col.id)
      .sort((a, b) => a.position - b.position)
  })

  // Cada card vira 3 linhas:
  //   linha 1: #ID type
  //   linha 2: titulo (truncado)
  //   linha 3: prio · status [· LIVE]
  const cellHeight = 4 // 3 + 1 espaço

  const maxRows = Math.max(0, ...cardsByColumn.map((cs) => cs.length))
  const lines: string[] = []
  lines.push(headers.join(''))
  lines.push(cols.map(() => c.dim('─').repeat(W - 1) + ' ').join(''))

  for (let row = 0; row < maxRows; row++) {
    const cellLines: string[][] = cols.map((_, i) => {
      const card = cardsByColumn[i][row]
      if (!card) return ['', '', '']
      const isLive = liveCardIds.has(card.id)
      return renderCardCell(card, W, isLive)
    })

    for (let l = 0; l < cellHeight - 1; l++) {
      lines.push(cellLines.map((cell) => pad(cell[l] || '', W)).join(''))
    }
    lines.push(cols.map(() => ' '.repeat(W)).join(''))
  }

  return lines.join('\n')
}

function renderCardCell(card: Card, w: number, isLive: boolean): string[] {
  const id = c.dim('#' + shortId(card.id))
  const typeC = (TYPE_COLOR[card.type] || c.gray)
  const prioC = (PRIO_COLOR[card.priority] || c.gray)
  const live = isLive ? ' ' + c.amber('● LIVE') : ''

  const line1 = ` ${id} ${typeC(card.type.slice(0, 4).toUpperCase())}${live}`
  const titleMax = w - 3
  const title = card.title.length > titleMax ? card.title.slice(0, titleMax - 1) + '…' : card.title
  const line2 = ' ' + c.bold(title)
  const status = card.spec_status ? ` ${c.dim('· ' + card.spec_status)}` : ''
  const line3 = ` ${prioC(card.priority.slice(0, 4).toUpperCase())}${status}`

  return [line1, line2, line3]
}

function pad(s: string, target: number): string {
  const v = visibleLength(s)
  if (v >= target) return s
  return s + ' '.repeat(target - v)
}

function colorDot(hex: string | null | undefined): string {
  if (!hex) return c.gray('●')
  // Best-effort: remap hex pra cor ANSI mais próxima
  if (hex.match(/red|^#[ef]/i)) return c.rose('●')
  if (hex.match(/yellow|amber|orange|^#f[c-f]/i)) return c.amber('●')
  if (hex.match(/green|emerald|^#[12]|^#0/i)) return c.emerald('●')
  if (hex.match(/blue|sky|cyan|^#3|^#0[6-9a]/i)) return c.cyan('●')
  if (hex.match(/purple|violet|magenta/i)) return c.magenta('●')
  return c.gray('●')
}
