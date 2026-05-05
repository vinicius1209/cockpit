import { loadAll } from '../api/store'
import { api } from '../api/client'
import { resolveWorkspace } from '../api/resolve'
import { c } from '../ui/colors'
import { divider } from '../ui/box'
import { kanban } from '../ui/kanban'
import { readConfigAsync } from '../config/daemon'

export async function board(ref?: string): Promise<void> {
  const { workspaces, cards, columns } = await loadAll()
  const cli = await readConfigAsync()

  const target = ref
    ? resolveWorkspace(ref, workspaces)
    : workspaces.find((w) => w.slug === cli.activeWorkspaceSlug) || workspaces[0]

  if (!target) {
    console.error(c.rose('✕ nenhum workspace encontrado.'))
    console.log(c.dim('  cockpit ws para listar, ou crie pelo web UI.'))
    process.exit(1)
  }

  const wsCols = columns[target.id] || []
  const wsCards = cards.filter((c) => c.workspace_id === target.id)

  // Live runs do daemon
  let liveCardIds = new Set<string>()
  try {
    const { sessions } = await api.listRunningSessions()
    liveCardIds = new Set(sessions.map((s) => s.cardId))
  } catch { /* daemon offline ok */ }

  console.log(divider(`BOARD · ${target.name.toUpperCase()}`, 'cyan'))
  console.log()
  console.log(kanban({ columns: wsCols, cards: wsCards, liveCardIds }))
  console.log()
  console.log(c.dim(`  ${wsCards.length} cards · ${liveCardIds.size > 0 ? c.amber(liveCardIds.size + ' LIVE') : 'idle'}`))
  console.log(c.dim(`  cockpit card show <ID> para abrir (sem o # — zsh trata como comentario)`))
}
