import { loadAll } from '../api/store'
import { api } from '../api/client'
import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { banner } from '../ui/banner'
import { shortId } from '../api/resolve'
import { readConfigAsync } from '../config/daemon'

// `cockpit` sem args: status overview global.
// Mostra: daemon, ws ativo, contadores, runs LIVE, atalhos.
export async function status(): Promise<void> {
  console.log(banner())

  const cli = await readConfigAsync()

  // Daemon health
  let daemonOk = false
  let daemonVersion: string | null = null
  try {
    const h = await api.health()
    daemonOk = h.status === 'ok'
    daemonVersion = h.version
  } catch { /* offline */ }

  if (!daemonOk) {
    console.log()
    console.log(c.rose('  ● daemon offline'))
    console.log(c.dim('    inicie: cd daemon && bun run dev'))
    console.log()
    return
  }

  // Load global state
  const { workspaces, cards, projects, activeWsId } = await loadAll()
  let runningSessions: Array<{ cardId: string; action: string; agent: string; startedAt: string }> = []
  try {
    const r = await api.listRunningSessions()
    runningSessions = r.sessions
  } catch { /* ok */ }

  // Resolve active workspace
  const activeWs = workspaces.find((w) => w.slug === cli.activeWorkspaceSlug)
    || workspaces.find((w) => w.id === activeWsId)
    || workspaces[0]

  // ── Active workspace block ──
  if (activeWs) {
    const wsCards = cards.filter((c) => c.workspace_id === activeWs.id)
    const inProgress = wsCards.filter((c) => c.spec_status === 'in_progress').length
    const review = wsCards.filter((c) => c.spec_status === 'review').length
    const done = wsCards.filter((c) => c.spec_status === 'done').length
    const wsProjects = projects.filter((p) => p.workspace_id === activeWs.id)

    console.log()
    console.log(section('Active workspace'))
    console.log(`  ${c.bold(activeWs.name)} ${c.dim('#' + activeWs.slug)}`)
    console.log(`  ${c.dim('cards')}   ${c.bold(String(wsCards.length).padStart(3, '0'))} ${c.dim('·')}` +
      ` ${c.amber(String(inProgress) + ' wip')} ${c.dim('·')}` +
      ` ${c.cyan(String(review) + ' review')} ${c.dim('·')}` +
      ` ${c.emerald(String(done) + ' done')}`)
    console.log(`  ${c.dim('proj')}    ${c.bold(String(wsProjects.length))} vinculado${wsProjects.length === 1 ? '' : 's'}`)
  }

  // ── Live runs block ──
  if (runningSessions.length > 0) {
    console.log()
    console.log(section(`Live runs (${runningSessions.length})`))
    for (const s of runningSessions) {
      const card = cards.find((c) => c.id === s.cardId)
      const elapsed = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000)
      const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
      console.log(`  ${c.amber('●')} ${c.dim('#' + shortId(s.cardId))} ${c.bold(actionLabel(s.action))}` +
        ` ${c.dim('· T+' + time)} ${c.dim('· ' + s.agent)}`)
      if (card) console.log(c.dim(`        ${truncate(card.title, 70)}`))
    }
  }

  // ── Other workspaces summary ──
  const otherWs = workspaces.filter((w) => w.id !== activeWs?.id)
  if (otherWs.length > 0) {
    console.log()
    console.log(section('Other workspaces'))
    for (const w of otherWs) {
      const wsCards = cards.filter((c) => c.workspace_id === w.id)
      const wsActive = runningSessions.some((s) => {
        const cd = cards.find((c) => c.id === s.cardId)
        return cd?.workspace_id === w.id
      })
      const indicator = wsActive ? c.amber('●') : c.dim('○')
      console.log(`  ${indicator} ${w.name.padEnd(20)} ${c.dim(`${wsCards.length} cards`)}`)
    }
  }

  // ── Hints ──
  console.log()
  console.log(c.dim('  cockpit board                ascii kanban do ws ativo'))
  console.log(c.dim('  cockpit card list            lista cards'))
  console.log(c.dim('  cockpit doctor               health check completo'))
  console.log(c.dim('  cockpit help                 todos os comandos'))
  console.log()

  if (daemonVersion) {
    console.log(c.dim(`  ${sym.ok} daemon v${daemonVersion}`))
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function actionLabel(action: string): string {
  if (action === 'spec') return 'GERANDO SPEC'
  if (action === 'implementation') return 'IMPLEMENTANDO'
  if (action === 'discovery') return 'DISCOVERY'
  if (action === 'chat') return 'AI CHAT'
  return action.toUpperCase()
}
