import { loadAll } from '../api/store'
import { resolveCard, shortId } from '../api/resolve'
import { c, sym } from '../ui/colors'
import { divider } from '../ui/box'
import { api } from '../api/client'
import { getSSE } from '../api/sse'
import { createStreamRenderer, renderChunk, classifyLine, flushOutputBuffer } from '../ui/stream-render'

interface WatchOpts {
  action?: 'spec' | 'implementation' | 'discovery' | 'chat'
}

export async function watch(ref: string, opts: WatchOpts = {}): Promise<void> {
  const { workspaces, cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card nao encontrado: ') + ref)
    process.exit(1)
  }

  const ws = workspaces.find((w) => w.id === card.workspace_id)
  if (!ws) {
    console.error(c.rose('✕ workspace nao encontrado'))
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
        if (event.type === 'snapshot') return  // ja temos do header
        if (event.type === 'chunk') {
          const text = event.text as string
          const isReplayed = !!event.replayed
          if (isReplayed) replayCount++
          else liveCount++

          // Heuristica simples: linha eh log se vier de message do daemon.
          // Aqui nao temos essa info — assume tudo como output, exceto
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
