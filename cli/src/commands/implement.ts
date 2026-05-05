import { loadAll } from '../api/store'
import { resolveCard, shortId } from '../api/resolve'
import { c, sym } from '../ui/colors'
import { divider } from '../ui/box'
import { postSSE } from '../api/sse'
import { createStreamRenderer, renderChunk, classifyLine, flushOutputBuffer } from '../ui/stream-render'

interface ImplementOpts {
  feedback?: string
  watch?: boolean
  noPr?: boolean
}

interface ImplementEvent {
  phase?: string
  message?: string
  text?: string
  branch?: string
  silenceSeconds?: number
  exitCode?: number
  summary?: { filesCreated: number; filesModified: number; filesDeleted: number; branch: string | null; prUrl?: string; prNumber?: number }
}

const PHASE_LABELS: Record<string, string> = {
  analyzing: 'ANALISANDO',
  branching: 'CRIANDO BRANCH',
  implementing: 'AGENT EXECUTANDO',
  'creating-pr': 'CRIANDO PR',
}

export async function implement(ref: string, opts: ImplementOpts = {}): Promise<void> {
  const { workspaces, cards, projects } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card nao encontrado: ') + ref)
    process.exit(1)
  }
  if (!card.spec_content) {
    console.error(c.rose('✕ card sem spec — gere uma antes'))
    console.log(c.dim('  use: cockpit spec gen #' + shortId(card.id)))
    process.exit(1)
  }

  const ws = workspaces.find((w) => w.id === card.workspace_id)
  if (!ws) {
    console.error(c.rose('✕ workspace do card nao encontrado'))
    process.exit(1)
  }

  // Resolve project: card.project_id ou primeiro do workspace
  const wsProjects = projects.filter((p) => p.workspace_id === ws.id)
  const project = card.project_id
    ? wsProjects.find((p) => p.id === card.project_id)
    : wsProjects[0]
  if (!project) {
    console.error(c.rose('✕ workspace nao tem projeto vinculado'))
    console.log(c.dim('  vincule pelo web UI > workspace settings > Projetos'))
    process.exit(1)
  }

  // Header
  console.log(divider(`IMPLEMENT · #${shortId(card.id)}`, 'cyan'))
  console.log(`  ${c.bold(card.title)}`)
  console.log(`  ${c.dim('ws:')} ${ws.name} ${c.dim('· proj:')} ${project.name}`)
  console.log(`  ${c.dim('agent:')} claude-code/sonnet`)
  if (opts.feedback) console.log(`  ${c.amber('feedback:')} ${opts.feedback}`)
  console.log()

  if (!opts.watch) {
    console.log(c.dim('  ━ background mode. para tail: ') + c.bold('cockpit watch #' + shortId(card.id)))
  }
  console.log()

  // SSE stream
  const renderer = createStreamRenderer()
  const startedAt = Date.now()
  let lastSilence = 0
  let success = false
  type ImplSummary = NonNullable<ImplementEvent['summary']>
  let summary: ImplSummary | null = null
  let branch: string | null = null

  const ctrl = new AbortController()
  process.on('SIGINT', () => {
    ctrl.abort()
    flushOutputBuffer(renderer)
    console.log()
    console.log(c.amber('━ ABORT enviado. agent CLI continua se ja spawnou. cleanup pelo daemon.'))
    process.exit(130)
  })

  try {
    await postSSE(
      '/agents/implement',
      {
        cardTitle: card.title,
        cardType: card.type,
        cardId: card.id,
        workspaceSlug: ws.slug,
        spec: card.spec_content,
        interviewNotes: card.interview_notes || undefined,
        projectPath: project.path,
        createBranch: true,
        autoPR: !opts.noPr && (project.auto_pr ?? false),
        feedback: opts.feedback,
        attempt: 1,
      },
      (rawEvent) => {
        const event = rawEvent as unknown as ImplementEvent
        if (!opts.watch) {
          // background mode: so processa eventos terminais
          if (event.phase === 'done' || event.phase === 'error') {
            handleTerminal(event)
          }
          return
        }

        // Watch mode: full render
        if (event.phase === 'heartbeat') {
          lastSilence = event.silenceSeconds || 0
          return
        }

        const phaseDivider = event.phase && PHASE_LABELS[event.phase]
        if (phaseDivider) {
          renderChunk({ kind: 'phase', text: phaseDivider, state: renderer })
        }

        if (event.message) {
          const k = classifyLine(event.message, true)
          renderChunk({ kind: k, text: event.message, state: renderer })
        }
        if (event.text) {
          const k = classifyLine(event.text, false)
          renderChunk({ kind: k, text: event.text, state: renderer })
        }

        if (event.branch) branch = event.branch

        if (event.phase === 'done' || event.phase === 'error') {
          handleTerminal(event)
        }
      },
      { signal: ctrl.signal },
    )
  } catch (err) {
    if (!ctrl.signal.aborted) {
      console.error(c.rose('✕ erro: ') + (err as Error).message)
      process.exit(1)
    }
  }

  function handleTerminal(event: ImplementEvent): void {
    flushOutputBuffer(renderer)
    if (event.phase === 'done') {
      success = true
      summary = event.summary ?? null
    }
    if (event.phase === 'error' && event.message) {
      console.log()
      console.log(c.rose('✕ ') + event.message)
    }
  }

  flushOutputBuffer(renderer)
  void lastSilence

  // Footer
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  console.log()
  console.log(divider('SUMMARY', success ? 'emerald' : 'rose'))
  console.log()
  if (success) {
    console.log(`  ${sym.ok} concluido em ${c.bold(formatDuration(elapsed))}`)
    if (branch) console.log(`  ${c.dim('branch:')} ${branch}`)
    const s = summary as ImplSummary | null
    if (s) {
      const parts: string[] = []
      if (s.filesCreated > 0) parts.push(c.emerald(`${s.filesCreated} criado${s.filesCreated > 1 ? 's' : ''}`))
      if (s.filesModified > 0) parts.push(c.amber(`${s.filesModified} modificado${s.filesModified > 1 ? 's' : ''}`))
      if (s.filesDeleted > 0) parts.push(c.rose(`${s.filesDeleted} deletado${s.filesDeleted > 1 ? 's' : ''}`))
      if (parts.length > 0) console.log(`  ${c.dim('arquivos:')} ${parts.join(', ')}`)
      if (s.prUrl) console.log(`  ${c.dim('PR:')} ${c.cyan(s.prUrl)}`)
    }
  } else {
    console.log(`  ${sym.err} falhou em ${formatDuration(elapsed)}`)
    console.log(c.dim(`  use ${c.bold('cockpit log #' + shortId(card.id))} para historico`))
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m${s.toString().padStart(2, '0')}s`
}
