import { c, visibleLength } from './colors'

export interface BoxOpts {
  title?: string
  width?: number
  borderColor?: 'cyan' | 'gray' | 'amber' | 'emerald' | 'rose'
}

const COLOR_MAP = {
  cyan: c.cyan,
  gray: c.gray,
  amber: c.amber,
  emerald: c.emerald,
  rose: c.rose,
} as const

// Box cockpit-style: ╭─ TITLE ────────────────╮
export function box(content: string | string[], opts: BoxOpts = {}): string {
  const lines = Array.isArray(content) ? content : content.split('\n')
  const colorize = COLOR_MAP[opts.borderColor || 'gray']
  const maxContent = Math.max(...lines.map(visibleLength))
  const width = opts.width || Math.min(maxContent + 4, (process.stdout.columns || 80) - 2)
  const innerW = width - 2

  const top = opts.title
    ? colorize(`╭─ `) + c.bold(opts.title) + ' ' + colorize('─'.repeat(Math.max(0, width - visibleLength(opts.title) - 5))) + colorize('╮')
    : colorize('╭' + '─'.repeat(width) + '╮')

  const body = lines.map((l) => {
    const visible = visibleLength(l)
    const pad = Math.max(0, innerW - visible - 1)
    return colorize('│ ') + l + ' '.repeat(pad) + colorize('│')
  })

  const bottom = colorize('╰' + '─'.repeat(width) + '╯')

  return [top, ...body, bottom].join('\n')
}

// Divider mono uppercase
export function divider(label?: string, color: 'cyan' | 'gray' | 'amber' | 'emerald' | 'rose' = 'gray'): string {
  const colorize = COLOR_MAP[color]
  const w = (process.stdout.columns || 80) - 2
  if (!label) return colorize('━'.repeat(w))
  const lab = ` ${label.toUpperCase()} `
  const each = Math.floor((w - visibleLength(lab)) / 2)
  return colorize('━'.repeat(each)) + c.bold(colorize(lab)) + colorize('━'.repeat(w - each - visibleLength(lab)))
}

// Section header tipo "━ NAME"
export function section(label: string): string {
  return c.dim(c.gray('━ ')) + c.bold(c.gray(label.toUpperCase()))
}
