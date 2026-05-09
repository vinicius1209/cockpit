// Live tail de uma session via SSE. Mostra últimas N linhas em scroll automático.

import type { Screen, KeyResult } from '../engine'
import type { Key } from '../keys'
import { c } from '../../ui/colors'
import { clip } from '../layout'
import { getSSE } from '../../api/sse'

export class SessionTailScreen implements Screen {
  name = 'session-tail'
  private chunks: string[] = []
  private phase = 'connecting'
  private finished = false
  private replayedCount = 0
  private liveCount = 0
  private err: string | null = null
  private ctrl: AbortController | null = null

  constructor(private sessionId: string, private cardId: string) {}

  async onEnter(): Promise<void> {
    this.ctrl = new AbortController()
    // Spawn SSE in background — events update local state and engine tick
    // re-renders. Don't await (would block onEnter).
    this.connect().catch((err) => { this.err = (err as Error).message })
  }

  async onLeave(): Promise<void> {
    this.ctrl?.abort()
  }

  private async connect(): Promise<void> {
    try {
      await getSSE(
        `/agents/sessions/${this.sessionId}/stream`,
        (event) => {
          if (event.type === 'snapshot') {
            const session = event.session as { phase?: string } | undefined
            if (session?.phase) this.phase = session.phase
            return
          }
          if (event.type === 'replay-done') {
            this.replayedCount = (event.replayedCount as number) || 0
            return
          }
          if (event.type === 'chunk') {
            const text = (event.text as string) || ''
            const isReplayed = !!event.replayed
            for (const line of text.split('\n')) {
              if (line.trim() === '') continue
              this.chunks.push(line)
              if (!isReplayed) this.liveCount++
            }
            // Cap em 1000 linhas pra evitar OOM em sessions longas
            if (this.chunks.length > 1000) this.chunks = this.chunks.slice(-800)
            return
          }
          if (event.type === 'done') {
            this.phase = 'done'
            this.finished = true
            return
          }
          if (event.type === 'error') {
            this.phase = 'error'
            this.finished = true
            this.err = (event.error as string) || 'erro'
            return
          }
        },
        { signal: this.ctrl?.signal },
      )
    } catch (err) {
      if (this.ctrl?.signal.aborted) return
      this.err = (err as Error).message
    }
  }

  async onKey(key: Key): Promise<KeyResult> {
    if (key.name === 'q' || key.name === 'escape' || key.name === 'backspace') {
      return { kind: 'pop' }
    }
    return { kind: 'consumed' }
  }

  render(width: number, height: number): string {
    const lines: string[] = []

    const shortId = this.cardId.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
    const isLive = !this.finished
    const liveTag = isLive ? c.amber('● LIVE') : (this.phase === 'done' ? c.emerald('● DONE') : c.rose('● ' + this.phase.toUpperCase()))

    lines.push(`  ${c.bold('TAIL')} ${c.dim('#' + shortId)}  ${liveTag}  ${c.dim('· chunks: ' + this.chunks.length + ' (' + this.liveCount + ' live, ' + this.replayedCount + ' replay)')}`)
    lines.push(c.dim('━'.repeat(width - 1)))

    if (this.err && this.chunks.length === 0) {
      lines.push('')
      lines.push(`  ${c.rose('✕')} ${this.err}`)
    } else {
      const visible = this.chunks.slice(-(height - 4))
      for (const l of visible) lines.push('  ' + clip(l, width - 4))
    }

    while (lines.length < height - 1) lines.push('')
    const footer = isLive
      ? `${c.dim('● seguindo live · esc/q')} voltar`
      : `${c.dim('session ' + this.phase + ' · esc/q')} voltar`
    lines[height - 1] = clip(' ' + footer, width - 1)
    return lines.join('\n')
  }
}
