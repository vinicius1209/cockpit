import { c, visibleLength } from './colors'

export interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
  width?: number
}

export function table(rows: Record<string, string>[], columns: Column[]): string {
  if (rows.length === 0) {
    return c.dim('  (vazio)')
  }

  // Compute widths
  const widths: Record<string, number> = {}
  for (const col of columns) {
    const headerW = visibleLength(col.label)
    const dataW = Math.max(...rows.map((r) => visibleLength(r[col.key] || '')))
    widths[col.key] = col.width ?? Math.max(headerW, dataW)
  }

  const fmt = (text: string, key: string, align: 'left' | 'right' = 'left') => {
    const pad = widths[key] - visibleLength(text)
    if (pad <= 0) return text
    return align === 'right' ? ' '.repeat(pad) + text : text + ' '.repeat(pad)
  }

  const header = columns
    .map((col) => c.dim(c.gray(fmt(col.label.toUpperCase(), col.key, col.align))))
    .join('  ')

  const lines = rows.map((r) =>
    columns.map((col) => fmt(r[col.key] || '', col.key, col.align)).join('  '),
  )

  return [header, ...lines].join('\n')
}
