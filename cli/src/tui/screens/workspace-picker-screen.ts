// Modal-style: lista workspaces, seleciona um, callback.

import type { Screen, KeyResult } from '../engine'
import type { Key } from '../keys'
import { c } from '../../ui/colors'
import { clip } from '../layout'
import { loadAll } from '../../api/store'
import type { Workspace } from '../../api/client'

export class WorkspacePickerScreen implements Screen {
  name = 'ws-picker'
  private workspaces: Workspace[] = []
  private selected = 0
  private err: string | null = null

  constructor(private onPick: (slug: string) => void | Promise<void>) {}

  async onEnter(): Promise<void> {
    try {
      const all = await loadAll()
      this.workspaces = all.workspaces
    } catch (err) { this.err = (err as Error).message }
  }

  async onKey(key: Key): Promise<KeyResult> {
    if (key.name === 'q' || key.name === 'escape' || key.name === 'backspace') return { kind: 'pop' }
    if (key.name === 'up' || key.name === 'k') {
      if (this.selected > 0) this.selected--
      return { kind: 'consumed' }
    }
    if (key.name === 'down' || key.name === 'j') {
      if (this.selected < this.workspaces.length - 1) this.selected++
      return { kind: 'consumed' }
    }
    if (key.name === 'enter') {
      const ws = this.workspaces[this.selected]
      if (ws) {
        await this.onPick(ws.slug)
        return { kind: 'pop' }
      }
    }
    return { kind: 'consumed' }
  }

  render(width: number, height: number): string {
    const lines: string[] = []
    lines.push(`  ${c.bold('▰')} ${c.bold('SELECIONAR WORKSPACE')}`)
    lines.push(c.dim('━'.repeat(width - 1)))
    if (this.err) lines.push(`  ${c.rose('✕')} ${this.err}`)
    else if (this.workspaces.length === 0) lines.push(c.dim('  Nenhum workspace. Crie pelo Web UI ou cockpit ws new.'))
    else {
      this.workspaces.forEach((ws, i) => {
        const sel = i === this.selected
        const line = `${c.bold(ws.name)} ${c.dim('#' + ws.slug)}${ws.description ? c.dim(' · ' + ws.description) : ''}`
        lines.push(sel ? `  ${c.cyan('▸')} ${line}` : `    ${line}`)
      })
    }

    while (lines.length < height - 1) lines.push('')
    lines[height - 1] = clip(`  ${c.dim('↑/↓')} navegar · ${c.dim('enter')} selecionar · ${c.dim('esc')} cancelar`, width - 1)
    return lines.join('\n')
  }
}
