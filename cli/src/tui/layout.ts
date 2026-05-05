// Layout helpers — clipping, padding, box drawing — pra Screens construir
// frames sem quebrar layout em terminais estreitos.

import { strip, visibleLength } from '../ui/colors'

const ANSI_RE = /\x1b\[[\d;]*m/g

/** Trunca string respeitando largura visivel (ignora ANSI). Suffix opcional. */
export function clip(s: string, maxWidth: number, suffix = '…'): string {
  if (visibleLength(s) <= maxWidth) return s
  // Walk chars, contando visivel; preserva ANSI code completo se estiver no meio
  let out = ''
  let count = 0
  let i = 0
  const sufLen = suffix.length
  const target = Math.max(0, maxWidth - sufLen)
  while (i < s.length && count < target) {
    if (s[i] === '\x1b') {
      // Copia escape sequence inteira
      const m = s.slice(i).match(/^\x1b\[[\d;]*m/)
      if (m) {
        out += m[0]
        i += m[0].length
        continue
      }
    }
    out += s[i]
    count++
    i++
  }
  return out + '\x1b[0m' + suffix
}

/** Pad direito ate width. Usa visibleLength. */
export function padRight(s: string, width: number, ch = ' '): string {
  const v = visibleLength(s)
  if (v >= width) return clip(s, width, '')
  return s + ch.repeat(width - v)
}

export function padLeft(s: string, width: number, ch = ' '): string {
  const v = visibleLength(s)
  if (v >= width) return clip(s, width, '')
  return ch.repeat(width - v) + s
}

/** Centraliza string em width. */
export function center(s: string, width: number, ch = ' '): string {
  const v = visibleLength(s)
  if (v >= width) return clip(s, width, '')
  const left = Math.floor((width - v) / 2)
  const right = width - v - left
  return ch.repeat(left) + s + ch.repeat(right)
}

/** Junta colunas lado a lado. Linha por linha, alinha por largura especificada. */
export function joinCols(cols: { content: string[]; width: number }[], gap = 1): string[] {
  const height = Math.max(...cols.map((c) => c.content.length))
  const out: string[] = []
  for (let row = 0; row < height; row++) {
    const parts: string[] = []
    for (const col of cols) {
      const line = col.content[row] || ''
      parts.push(padRight(line, col.width))
    }
    out.push(parts.join(' '.repeat(gap)))
  }
  return out
}

/** Caixa simples Unicode com titulo opcional. */
export function box(content: string[], opts: { width: number; title?: string; color?: (s: string) => string } = { width: 30 }): string[] {
  const colorize = opts.color || ((s: string) => s)
  const inner = opts.width - 2
  const top = opts.title
    ? colorize(`╭─ ${opts.title} `) + colorize('─'.repeat(Math.max(0, opts.width - visibleLength(opts.title) - 5))) + colorize('╮')
    : colorize('╭' + '─'.repeat(opts.width - 2) + '╮')
  const bottom = colorize('╰' + '─'.repeat(opts.width - 2) + '╯')
  const body = content.map((line) => colorize('│ ') + padRight(line, inner - 1) + colorize('│'))
  return [top, ...body, bottom]
}

export { strip, visibleLength, ANSI_RE }
