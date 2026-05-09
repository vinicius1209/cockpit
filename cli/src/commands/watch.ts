import { loadAll } from '../api/store'
import { resolveCard, shortId } from '../api/resolve'
import { c, sym, strip } from '../ui/colors'
import { divider } from '../ui/box'
import { api, type AgentSession } from '../api/client'
import { getSSE } from '../api/sse'
import { createStreamRenderer, renderChunk, classifyLine, flushOutputBuffer } from '../ui/stream-render'

interface WatchOpts {
  action?: 'spec' | 'implementation' | 'discovery' | 'chat'
}

interface WatchAllOpts {
  includeCompleted?: boolean  // se true, mostra completas também (snapshot read-only)
}

export async function watch(ref: string, opts: WatchOpts = {}): Promise<void> {
  const { workspaces, cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }

  const ws = workspaces.find((w) => w.id === card.workspace_id)
  if (!ws) {
    console.error(c.rose('✕ workspace não encontrado'))
    process.exit(1)
  }

  // Pega a session mais recente do card (filtrada por action se passou)
  const r = await api.getLatestSession(ws.slug, card.id, opts.action)
  const session = r.session
  if (!session) {
    console.error(c.rose('✕ nenhuma session encontrada para #' + shortId(card.id)))
    if (opts.action) console.log(c.dim('  filtrada por action=' + opts.action))
    process.exit(1)
  }

  const isLive = session.phase !== 'done' && session.phase !== 'error' && !session.completedAt

  // Header
  console.log(divider(`WATCH · #${shortId(card.id)}${isLive ? '  ● LIVE' : ''}`, isLive ? 'amber' : 'gray'))
  console.log(`  ${c.bold(card.title)}`)
  console.log(`  ${c.dim('action:')} ${session.action} ${c.dim('· agent:')} ${session.agent}${session.model ? c.dim('/' + session.model) : ''}`)
  console.log(`  ${c.dim('phase:')} ${session.phase} ${c.dim('· chunks:')} ${session.chunks?.length || 0}`)
  if (!isLive) {
    console.log(`  ${c.dim('terminada em ' + new Date(session.completedAt!).toLocaleString('pt-BR'))}`)
  }
  console.log()

  const renderer = createStreamRenderer()
  let replayCount = 0
  let liveCount = 0

  const ctrl = new AbortController()
  process.on('SIGINT', () => {
    ctrl.abort()
    flushOutputBuffer(renderer)
    console.log()
    console.log(c.dim('━ desconectado. session segue rodando no daemon.'))
    process.exit(0)
  })

  try {
    await getSSE(
      `/agents/sessions/${session.id}/stream`,
      (event) => {
        if (event.type === 'snapshot') return  // já temos do header
        if (event.type === 'chunk') {
          const text = event.text as string
          const isReplayed = !!event.replayed
          if (isReplayed) replayCount++
          else liveCount++

          // Heuristica simples: linha eh log se vier de message do daemon.
          // Aqui não temos essa info — assume tudo como output, exceto
          // se for tool (▶ ...). Eh um trade-off do replay simplificado.
          const k = classifyLine(text, false)
          renderChunk({ kind: k, text, state: renderer })
        }
        if (event.type === 'replay-done') {
          flushOutputBuffer(renderer)
          if (replayCount > 0) {
            console.log()
            console.log(c.dim(`━ ${replayCount} chunks restaurados ${isLive ? '· seguindo live' : ''}`))
            console.log()
          }
        }
        if (event.type === 'done') {
          flushOutputBuffer(renderer)
          console.log()
          console.log(c.emerald(`✓ session concluida (exitCode=${event.exitCode || 0})`))
          ctrl.abort()
        }
        if (event.type === 'error') {
          flushOutputBuffer(renderer)
          console.log()
          console.log(c.rose(`✕ ${event.error || 'erro'}`))
          ctrl.abort()
        }
      },
      { signal: ctrl.signal },
    )
  } catch (err) {
    if (ctrl.signal.aborted) return
    console.error(c.rose('✕ erro: ') + (err as Error).message)
    process.exit(1)
  }

  flushOutputBuffer(renderer)
  if (liveCount > 0) {
    console.log(c.dim(`  ━ ${liveCount} chunks live recebidos`))
  }
  void sym
}

// ── Multiplex (cockpit watch --all) ──
//
// Conecta SSE em todas as sessions rodando e renderiza cronologicamente,
// cada chunk prefixado com [#SW79·spec] colorido. Quando uma session termina,
// emite footer e remove do pool. Sai quando todas terminarem ou em Ctrl+C.

const LANE_COLORS = [c.cyan, c.amber, c.emerald, c.magenta, c.sky, c.rose] as const
type Colorizer = typeof LANE_COLORS[number]

interface Lane {
  session: AgentSession
  cardShort: string
  cardTitle: string
  workspace: string
  colorize: Colorizer
  label: string  // pre-rendered [#SW79·spec]
  liveCount: number
  unsubscribe?: () => void
}

export async function watchAll(opts: WatchAllOpts = {}): Promise<void> {
  const { workspaces, cards } = await loadAll()
  const wsByCardId = new Map<string, string>()
  const titleByCardId = new Map<string, string>()
  for (const card of cards) {
    const ws = workspaces.find((w) => w.id === card.workspace_id)
    if (ws) wsByCardId.set(card.id, ws.slug)
    titleByCardId.set(card.id, card.title)
  }

  const r = await api.listRunningSessions()
  let sessions = r.sessions
  if (!opts.includeCompleted) {
    sessions = sessions.filter((s) => !s.completedAt && s.phase !== 'done' && s.phase !== 'error')
  }

  if (sessions.length === 0) {
    console.log(divider('WATCH · ALL', 'gray'))
    console.log()
    console.log(c.dim('  nenhuma session rodando agora'))
    console.log()
    console.log(c.dim('  dispare uma com:'))
    console.log(c.dim('    cockpit implement <id>          ') + c.gray('# CLI'))
    console.log(c.dim('    cockpit_implement_async         ') + c.gray('# MCP no Claude Code'))
    return
  }

  // Header
  console.log(divider(`WATCH · ALL · ${sessions.length} session${sessions.length > 1 ? 's' : ''}`, 'amber'))
  console.log()

  const lanes = new Map<string, Lane>()
  sessions.forEach((session, idx) => {
    const cardShort = shortId(session.cardId)
    const colorize = LANE_COLORS[idx % LANE_COLORS.length]
    const label = colorize(`[#${cardShort}·${session.action}]`)
    const lane: Lane = {
      session,
      cardShort,
      cardTitle: titleByCardId.get(session.cardId) || '(sem titulo)',
      workspace: session.workspaceSlug,
      colorize,
      label,
      liveCount: 0,
    }
    lanes.set(session.id, lane)

    // Print lane header
    console.log(`  ${label} ${c.bold(lane.cardTitle.slice(0, 50))}`)
    console.log(`  ${' '.repeat(strip(label).length)} ${c.dim(`ws: ${lane.workspace} · agent: ${session.agent}${session.model ? '/' + session.model : ''} · phase: ${session.phase}`)}`)
  })
  console.log()
  console.log(divider('TIMELINE', 'gray'))
  console.log()

  const ctrl = new AbortController()
  let aborted = false
  process.on('SIGINT', () => {
    aborted = true
    ctrl.abort()
    console.log()
    console.log(c.dim(`━ desconectado. ${lanes.size} session${lanes.size > 1 ? 's' : ''} segue${lanes.size > 1 ? 'm' : ''} rodando no daemon.`))
    process.exit(0)
  })

  // Promise por lane — resolve quando a SSE termina (done/error/cancel)
  const lanePromises = Array.from(lanes.values()).map((lane) =>
    streamLane(lane, lanes, ctrl).catch((err) => {
      if (aborted) return
      printLaneLine(lane, c.rose(`✕ stream error: ${(err as Error).message}`))
    }),
  )

  await Promise.all(lanePromises)

  if (!aborted) {
    console.log()
    console.log(divider('SUMMARY', 'emerald'))
    const totalLive = Array.from(lanes.values()).reduce((acc, l) => acc + l.liveCount, 0)
    console.log()
    console.log(`  ${sym.ok} ${sessions.length} session${sessions.length > 1 ? 's' : ''} concluida${sessions.length > 1 ? 's' : ''} ${c.dim(`· ${totalLive} chunks live`)}`)
  }
}

async function streamLane(
  lane: Lane,
  lanes: Map<string, Lane>,
  ctrl: AbortController,
): Promise<void> {
  let replayDone = false  // suprime chunks anteriores até replay-done

  await getSSE(
    `/agents/sessions/${lane.session.id}/stream`,
    (event) => {
      if (event.type === 'snapshot') return
      if (event.type === 'replay-done') {
        replayDone = true
        // Marca início do live com um divisor sutil
        printLaneLine(lane, c.dim(`━ live (replay ${(event.replayedCount as number) || 0})`))
        return
      }
      if (event.type === 'chunk') {
        if (!replayDone) return  // ignora replays no modo --all (foco em live)
        const text = (event.text as string) || ''
        lane.liveCount++
        // Quebra em linhas, cada uma com prefix
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          printLaneLine(lane, line)
        }
        return
      }
      if (event.type === 'done') {
        printLaneLine(lane, c.emerald(`✓ done (exit=${(event.exitCode as number) ?? 0})`))
        lanes.delete(lane.session.id)
        ctrl.signal.aborted || lane.unsubscribe?.()
        return
      }
      if (event.type === 'error') {
        printLaneLine(lane, c.rose(`✕ ${(event.error as string) || 'error'}`))
        lanes.delete(lane.session.id)
        return
      }
    },
    { signal: ctrl.signal },
  )
}

function printLaneLine(lane: Lane, text: string): void {
  // Trunca linhas longas pra não quebrar o layout
  const w = (process.stdout.columns || 100) - strip(lane.label).length - 4
  const truncated = strip(text).length > w ? text.slice(0, w) + c.dim('…') : text
  console.log(`  ${lane.label} ${truncated}`)
}
