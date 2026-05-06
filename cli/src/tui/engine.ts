// Engine TUI minimalista, zero deps. Alternate screen buffer + raw mode +
// event loop. Renderiza Screens que sao funcoes puras (state → string).
//
// Filosofia: nada de framework — apenas escape sequences ANSI e stdin raw.
// Bun nao tem 'readline' nativo (Node.tty); usamos process.stdin diretamente.

import { parseKey, type Key } from './keys'

// ── Escape sequences ──
const ESC = '\x1b'
const CSI = `${ESC}[`
export const ANSI = {
  enterAltScreen: `${CSI}?1049h`,
  exitAltScreen: `${CSI}?1049l`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  clear: `${CSI}2J`,
  home: `${CSI}H`,
  enableMouse: `${CSI}?1000h`,   // basic mouse — opcional
  disableMouse: `${CSI}?1000l`,
  reset: `${CSI}0m`,
  // Cursor positioning: 1-indexed
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  saveCursor: `${ESC}7`,
  restoreCursor: `${ESC}8`,
  clearLine: `${CSI}2K`,
}

// ── Frame buffer ──
// Acumula linhas pra escrever de uma vez (reduz flicker em terminais lentos).
export class FrameBuffer {
  private rows: string[] = []
  private cols: number
  // private rowsCount: number  // reserved for clipping

  constructor(rows: number, cols: number) {
    this.cols = cols
    // void rows  // reserved for clipping in future
    void rows
    this.rows = []
  }

  push(line: string): void {
    this.rows.push(line)
  }

  pad(): void {
    // Garantee blank lines pra preencher resto do terminal — evita lixo da
    // tela anterior ficar visivel. Cada linha clearLine + newline.
    while (this.rows.length < (process.stdout.rows || 24) - 1) {
      this.rows.push('')
    }
  }

  toString(): string {
    return this.rows.map((r) => `${ANSI.clearLine}${r}`).join('\n')
  }

  width(): number { return this.cols }
}

// ── Engine ──

export interface Screen {
  /** Renderiza a tela inteira. Retorna o frame completo (sem move-cursor —
   *  o engine faz isso). */
  render(width: number, height: number): string
  /** Recebe key events. Retorna 'consumed' (engine continua), 'quit', ou um
   *  string com nome de outra screen pra fazer push. */
  onKey(key: Key): KeyResult | Promise<KeyResult>
  /** Opcional — chamado quando a tela ganha foco (push/return). */
  onEnter?(): void | Promise<void>
  /** Opcional — chamado quando a tela perde foco (push/pop). */
  onLeave?(): void | Promise<void>
  /** Opcional — chamado periodicamente pelo engine pra refresh. */
  tick?(): void | Promise<void>
  /** Identificador pra debug. */
  name: string
}

export type KeyResult =
  | { kind: 'consumed' }
  | { kind: 'quit' }
  | { kind: 'push'; screen: Screen }
  | { kind: 'pop' }
  | { kind: 'replace'; screen: Screen }

export class TuiEngine {
  private stack: Screen[] = []
  private quit = false
  private dirty = true
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private resizeListener: (() => void) | null = null
  private signalListener: (() => void) | null = null
  // C4 fix — handlers globais pra restaurar terminal mesmo em paths
  // anomalos (uncaughtException, unhandledRejection, exit normal).
  // cleanupDone garante idempotencia (nao restaura 2x).
  private cleanupDone = false
  private uncaughtHandler: ((err: Error) => void) | null = null
  private rejectionHandler: ((reason: unknown) => void) | null = null
  private exitHandler: (() => void) | null = null

  constructor(private root: Screen) {}

  async start(): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('TUI requer um TTY (stdout/stdin)')
      process.exit(1)
    }

    // Setup terminal
    process.stdout.write(ANSI.enterAltScreen + ANSI.hideCursor + ANSI.clear + ANSI.home)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    this.stack.push(this.root)
    if (this.root.onEnter) await this.root.onEnter()

    this.resizeListener = () => { this.dirty = true; this.draw() }
    process.stdout.on('resize', this.resizeListener)

    this.signalListener = () => { this.quit = true }
    process.on('SIGINT', this.signalListener)
    process.on('SIGTERM', this.signalListener)

    // C4 fix — fallbacks pra cenarios anomalos onde o for-await loop
    // nao volta normalmente: exception nao tratada, rejection nao tratada,
    // ou processo sendo killed (SIGKILL nao captura, mas SIGTERM/exit sim).
    //
    // Comportamento: imprime stack-trace e sai com restore do terminal.
    // Se nao restaurar: usuario fica com terminal em raw mode (sem echo,
    // alt screen ativo) — irrecuperavel sem `reset`.
    this.uncaughtHandler = (err: Error) => {
      this.cleanupSync()
      // Imprime apos restaurar terminal pra mensagem ser visivel
      console.error('\n[tui] uncaught exception:', err.message)
      console.error(err.stack)
      process.exit(1)
    }
    this.rejectionHandler = (reason: unknown) => {
      this.cleanupSync()
      console.error('\n[tui] unhandled rejection:', reason)
      process.exit(1)
    }
    // 'exit' handler — last resort. Roda sync, sem async ops possiveis.
    this.exitHandler = () => {
      this.cleanupSync()
    }
    process.on('uncaughtException', this.uncaughtHandler)
    process.on('unhandledRejection', this.rejectionHandler)
    process.on('exit', this.exitHandler)

    // Tick a cada 500ms — chamada nas screens pra refreshes leves (ex:
    // re-render counter de chunks ao vivo). Cada screen gerencia se tem
    // tick e se re-renderiza.
    this.tickInterval = setInterval(async () => {
      const top = this.stack[this.stack.length - 1]
      if (top?.tick) {
        try { await top.tick() } catch { /* ignore */ }
        this.dirty = true
        this.draw()
      }
    }, 500)

    this.draw()

    // Event loop — process.stdin chunks
    for await (const chunk of process.stdin as unknown as AsyncIterable<string>) {
      if (this.quit) break
      const keys = parseKey(chunk)
      for (const key of keys) {
        // Ctrl+C força quit imediato
        if (key.ctrl && key.name === 'c') {
          this.quit = true
          break
        }
        const top = this.stack[this.stack.length - 1]
        if (!top) { this.quit = true; break }
        try {
          const result = await top.onKey(key)
          await this.handleResult(result)
        } catch (err) {
          // I11 fix — antes nao setava dirty=true, entao se nenhum tick
          // disparasse depois, error message ficava congelada na tela.
          // Agora marca dirty + força redraw imediato, aviso some no proximo
          // draw normal (proximo onKey).
          process.stdout.write(ANSI.moveTo(1, 1) + ANSI.clearLine + `\x1b[91merror in ${top.name}: ${(err as Error).message}\x1b[0m`)
          this.dirty = true
        }
      }
      if (this.quit) break
      this.draw()
    }

    await this.cleanup()
  }

  private async handleResult(result: KeyResult): Promise<void> {
    switch (result.kind) {
      case 'consumed':
        this.dirty = true
        return
      case 'quit':
        this.quit = true
        return
      case 'push': {
        const top = this.stack[this.stack.length - 1]
        if (top?.onLeave) await top.onLeave()
        this.stack.push(result.screen)
        if (result.screen.onEnter) await result.screen.onEnter()
        this.dirty = true
        return
      }
      case 'pop': {
        if (this.stack.length <= 1) {
          this.quit = true
          return
        }
        const popped = this.stack.pop()!
        if (popped.onLeave) await popped.onLeave()
        const newTop = this.stack[this.stack.length - 1]
        if (newTop?.onEnter) await newTop.onEnter()
        this.dirty = true
        return
      }
      case 'replace': {
        const top = this.stack.pop()!
        if (top.onLeave) await top.onLeave()
        this.stack.push(result.screen)
        if (result.screen.onEnter) await result.screen.onEnter()
        this.dirty = true
        return
      }
    }
  }

  private draw(): void {
    if (!this.dirty || this.quit) return
    const cols = process.stdout.columns || 80
    const rows = process.stdout.rows || 24
    const top = this.stack[this.stack.length - 1]
    if (!top) return
    const frame = top.render(cols, rows)

    // Em raw mode, '\n' faz line feed mas NAO carriage return — cursor fica
    // na coluna onde a linha anterior terminou, criando staircase. Solucao:
    // escrever cada linha posicionando o cursor explicitamente (moveTo) e
    // limpando a linha (clearLine) antes do conteudo.
    const lines = frame.split('\n')
    const maxLines = Math.min(lines.length, rows)
    let out = ''
    for (let i = 0; i < maxLines; i++) {
      out += ANSI.moveTo(i + 1, 1) + ANSI.clearLine + lines[i]
    }
    // Limpa qualquer linha residual (frame anterior com mais linhas que o atual)
    for (let i = maxLines; i < rows; i++) {
      out += ANSI.moveTo(i + 1, 1) + ANSI.clearLine
    }
    // Parqueia o cursor no canto direito da ultima linha pra evitar piscar
    // no meio do conteudo enquanto o proximo frame e construido.
    out += ANSI.moveTo(rows, cols)
    process.stdout.write(out)
    this.dirty = false
  }

  /** Sinaliza que a tela mudou — proximo tick redesenha. Util pra screens
   *  que recebem callbacks async (SSE etc). */
  markDirty(): void {
    this.dirty = true
    this.draw()
  }

  private async cleanup(): Promise<void> {
    if (this.cleanupDone) return
    this.cleanupDone = true

    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.resizeListener) process.stdout.off('resize', this.resizeListener)
    if (this.signalListener) {
      process.off('SIGINT', this.signalListener)
      process.off('SIGTERM', this.signalListener)
    }
    if (this.uncaughtHandler) process.off('uncaughtException', this.uncaughtHandler)
    if (this.rejectionHandler) process.off('unhandledRejection', this.rejectionHandler)
    if (this.exitHandler) process.off('exit', this.exitHandler)

    // Pop all screens (run onLeave handlers)
    while (this.stack.length > 0) {
      const s = this.stack.pop()!
      if (s.onLeave) {
        try { await s.onLeave() } catch { /* ignore */ }
      }
    }
    this.restoreTerminal()
  }

  /**
   * C4 fix — restoreTerminal sync, sem awaits. Usado por handlers de
   * uncaughtException, unhandledRejection e 'exit' onde nao podemos
   * fazer async ops. Idempotente via cleanupDone.
   */
  private cleanupSync(): void {
    if (this.cleanupDone) return
    this.cleanupDone = true
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.resizeListener) {
      try { process.stdout.off('resize', this.resizeListener) } catch { /* ignore */ }
    }
    this.restoreTerminal()
  }

  private restoreTerminal(): void {
    try {
      process.stdout.write(ANSI.showCursor + ANSI.exitAltScreen + ANSI.reset)
    } catch { /* stdout pode estar fechado */ }
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
    } catch { /* nao TTY ou ja restored */ }
    try { process.stdin.pause() } catch { /* ignore */ }
  }
}
