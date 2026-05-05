import { TuiEngine } from '../tui/engine'
import { BoardScreen } from '../tui/screens/board-screen'
import { api } from '../api/client'
import { c } from '../ui/colors'

export async function tui(): Promise<void> {
  // Pre-flight: daemon precisa estar online
  try {
    await api.health()
  } catch {
    console.error(c.rose('✕ daemon offline em ') + c.dim('127.0.0.1:4800'))
    console.error(c.dim('  inicie com: bun run dev:daemon  (ou cockpit daemon install)'))
    process.exit(1)
  }

  const root = new BoardScreen()
  const engine = new TuiEngine(root)
  await engine.start()
}
