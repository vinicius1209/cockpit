// Renderer compartilhado de chunks de stream (implement / spec / chat).
// Mantem um pequeno state pra agrupar deltas de output na MESMA linha
// (evita "V" + "ou comecar..." em duas linhas).

import { c } from './colors'

export interface StreamRendererState {
  lastKind: 'log' | 'output' | 'tool' | null
  outputBuffer: string
  lastPhase: string | null
}

export function createStreamRenderer(): StreamRendererState {
  return { lastKind: null, outputBuffer: '', lastPhase: null }
}

interface RenderOpts {
  /** kind do chunk recebido */
  kind: 'log' | 'output' | 'tool' | 'phase' | 'error'
  text: string
  state: StreamRendererState
}

export function renderChunk(opts: RenderOpts): void {
  const { kind, text, state } = opts

  // Phase divider: limpa buffer, imprime banner mono uppercase
  if (kind === 'phase') {
    flushOutputBuffer(state)
    if (state.lastPhase !== text) {
      printPhaseHeader(text)
      state.lastPhase = text
    }
    state.lastKind = null
    return
  }

  // Output → buffer + flush em \n
  if (kind === 'output') {
    if (state.lastKind && state.lastKind !== 'output') {
      flushOutputBuffer(state)
    }
    state.outputBuffer += text
    // Flush por linha completa
    while (state.outputBuffer.includes('\n')) {
      const i = state.outputBuffer.indexOf('\n')
      const line = state.outputBuffer.slice(0, i)
      state.outputBuffer = state.outputBuffer.slice(i + 1)
      process.stdout.write(line + '\n')
    }
    state.lastKind = 'output'
    return
  }

  flushOutputBuffer(state)

  if (kind === 'log') {
    process.stdout.write(c.dim(c.cyan('› ')) + c.cyan(text) + '\n')
    state.lastKind = 'log'
    return
  }

  if (kind === 'tool') {
    process.stdout.write(c.amber('▶ ') + c.amber(text) + '\n')
    state.lastKind = 'tool'
    return
  }

  if (kind === 'error') {
    process.stdout.write(c.rose('✕ ') + c.rose(text) + '\n')
    state.lastKind = null
    return
  }
}

export function flushOutputBuffer(state: StreamRendererState): void {
  if (state.outputBuffer.length > 0) {
    process.stdout.write(state.outputBuffer)
    if (!state.outputBuffer.endsWith('\n')) process.stdout.write('\n')
    state.outputBuffer = ''
  }
}

function printPhaseHeader(label: string): void {
  const w = Math.min((process.stdout.columns || 80) - 2, 60)
  const lab = ` ${label.toUpperCase()} `
  const each = Math.max(3, Math.floor((w - lab.length) / 2))
  const line = c.cyan('─'.repeat(each)) + c.bold(c.cyan(lab)) + c.cyan('─'.repeat(w - each - lab.length))
  process.stdout.write('\n' + line + '\n')
}

// Helper: classifica linha "vinda do daemon" (event.message ou event.text)
// no kind correto. Heuristica reusa logica de implement-panel.
export function classifyLine(text: string, isLog: boolean): 'log' | 'output' | 'tool' {
  if (text.startsWith('▶ ')) return 'tool'
  if (isLog) return 'log'
  return 'output'
}
