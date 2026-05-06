import { executeAgentWithCallbacks, detectInstalledAgents } from '../executor/agent-executor'
import { TaskWorkspace } from '../tasks/task-workspace'
import { createPR } from '../git/pr-creator'
import { createSession, updateSession, appendOutput, appendFile, registerSessionAbort, unregisterSessionAbort, type SessionFile } from '../tasks/session-manager'
import { peekActiveProjectLock, acquireProjectLock, releaseProjectLock, ProjectLockedError } from '../tasks/project-lock'
import { createWorktree, removeWorktree, type WorktreeInfo } from '../git/worktree-manager'
import { runHook, formatHookResultLine, type HookContext } from '../hooks/hook-runner'

export interface ImplementConfig {
  cardTitle: string
  cardType: string
  cardId?: string
  workspaceSlug?: string
  spec: string
  interviewNotes?: string
  projectPath: string
  agent?: string
  model?: string
  createBranch: boolean
  autoPR?: boolean
  feedback?: string
  attempt?: number
  /** F9-B — modo de isolamento. 'lock' (default) usa project-lock + working
   *  tree compartilhado. 'worktree' cria git worktree separado por session,
   *  permitindo paralelismo real no mesmo projeto. */
  isolation?: 'lock' | 'worktree'
}

export interface ImplementEvent {
  phase: 'session-started' | 'analyzing' | 'branching' | 'implementing' | 'output' | 'file' | 'creating-pr' | 'done' | 'error' | 'heartbeat'
  message?: string
  text?: string
  branch?: string
  action?: 'modified' | 'created' | 'deleted' | 'changed'
  path?: string
  summary?: { filesModified: number; filesCreated: number; filesDeleted: number; branch: string | null; prUrl?: string; prNumber?: number }
  exitCode?: number
  /** When phase=heartbeat: seconds since last real chunk arrived. UI shows this
   *  as a status bar indicator instead of spam lines. */
  silenceSeconds?: number
  /** When phase=session-started: id of the persisted session row. Allows clients
   *  (notably MCP cockpit_implement_async) to return the sessionId early and
   *  follow up via cockpit_get_session / SSE replay. */
  sessionId?: string
}

const BRANCH_PREFIX: Record<string, string> = {
  feature: 'feat',
  bugfix: 'fix',
  hotfix: 'hotfix',
  chore: 'chore',
  improvement: 'improve',
  discovery: 'feat',
}

async function runCmd(cmd: string, args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const output = await new Response(proc.stdout).text()
  await proc.exited
  return output
}

export async function analyzeGitFlow(projectPath: string): Promise<{ currentBranch: string; hasGit: boolean }> {
  try {
    const branch = (await runCmd('git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)).trim()
    return { currentBranch: branch, hasGit: true }
  } catch {
    return { currentBranch: '', hasGit: false }
  }
}

export function generateBranchName(cardType: string, cardTitle: string): string {
  const prefix = BRANCH_PREFIX[cardType] || 'feat'
  const slug = cardTitle
    .toLowerCase()
    .replace(/\[.*?\]\s*/g, '') // remove [sub-project] prefix
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .replace(/-$/, '')
  return `${prefix}/${slug}`
}

function buildImplementationPrompt(config: ImplementConfig, taskPath?: string): string {
  const parts: string[] = []
  const isRetry = (config.attempt || 1) > 1

  if (isRetry) {
    parts.push(`## ATENCAO: Esta e a tentativa ${config.attempt} de implementacao.`)
    parts.push(`A tentativa anterior NAO resolveu o problema. O usuario testou e reportou feedback.`)
    parts.push('')
  }

  parts.push(`Voce recebeu uma tarefa para ${isRetry ? 'CORRIGIR' : 'implementar'} no codigo deste projeto.`)
  parts.push('')
  parts.push(`## Card`)
  parts.push(`Titulo: ${config.cardTitle}`)
  parts.push(`Tipo: ${config.cardType}`)

  if (taskPath) {
    parts.push('')
    parts.push(`## Task Workspace`)
    parts.push(`Os arquivos de contexto desta tarefa estao em: .cockpit/task/ (relativo ao projeto)`)
    parts.push('')
    parts.push(`Arquivos disponiveis:`)
    parts.push(`- **.cockpit/task/spec.md**: Especificacao tecnica completa — LEIA ESTE ARQUIVO`)
    parts.push(`- **.cockpit/task/discovery.md**: Analise previa do card (se existir)`)
    parts.push(`- **.cockpit/task/interview.md**: Notas da entrevista (se existir)`)
    if (isRetry) {
      parts.push(`- **.cockpit/task/feedback.md**: FEEDBACK DO USUARIO — LEIA ESTE ARQUIVO (critico!)`)
      parts.push(`- **.cockpit/task/implementation.md**: Log das tentativas anteriores`)
    }
    parts.push('')
    if (isRetry) {
      parts.push(`IMPORTANTE: Leia .cockpit/task/feedback.md PRIMEIRO para entender o que deu errado.`)
      parts.push(`Depois leia .cockpit/task/spec.md para contexto completo.`)
      parts.push(`Corrija os problemas descritos no feedback. Nao refaca tudo — ajuste o que ja foi feito.`)
    } else {
      parts.push(`Leia o arquivo .cockpit/task/spec.md para entender o que implementar.`)
    }
  } else {
    // Fallback: inline content
    parts.push('')
    parts.push(`## Spec Tecnica`)
    parts.push(config.spec)

    if (config.interviewNotes) {
      parts.push('')
      parts.push(`## Notas da Entrevista`)
      parts.push(config.interviewNotes)
    }

    if (isRetry && config.feedback) {
      parts.push('')
      parts.push(`## FEEDBACK DO USUARIO (tentativa ${(config.attempt || 1) - 1} nao resolveu)`)
      parts.push(config.feedback)
      parts.push('')
      parts.push(`Corrija os problemas acima. Nao refaca tudo — ajuste o que ja foi feito.`)
    }
  }

  parts.push('')
  parts.push(`## Instrucoes`)
  if (isRetry) {
    parts.push(`1. Leia o feedback do usuario (PRIORIDADE MAXIMA)`)
    parts.push(`2. Leia o log de implementacao anterior para entender o que ja foi feito`)
    parts.push(`3. Corrija APENAS o que o feedback reporta`)
    parts.push(`4. Siga as convencoes do projeto existente`)
    parts.push(`5. Faca um commit descritivo explicando a correcao`)
  } else {
    parts.push(`1. Leia os arquivos relevantes mencionados na spec`)
    parts.push(`2. Implemente TODAS as mudancas descritas nos Requisitos Funcionais`)
    parts.push(`3. Siga as convencoes do projeto existente`)
    parts.push(`4. Crie testes se a spec mencionar`)
    parts.push(`5. Nao altere arquivos nao relacionados a spec`)
    parts.push(`6. Use portugues brasileiro para textos de UI`)
    parts.push(`7. Faca commits atomicos com mensagens descritivas`)
  }

  return parts.join('\n')
}

export async function runImplementation(
  config: ImplementConfig,
  emit: (event: ImplementEvent) => void,
): Promise<void> {
  const { createBranch } = config
  // F9-B — projectPath original NUNCA muda (validacao, lock check, fontes).
  // Quando isolation=worktree, o agent roda em activeProjectPath (worktree).
  // Locks e analises continuam usando origProjectPath.
  const origProjectPath = config.projectPath
  let activeProjectPath = origProjectPath
  let worktree: WorktreeInfo | null = null

  // 0. F9-A — pre-check do project lock. Em modo worktree o lock e por path
  // do worktree (que ainda nao existe), entao soh checamos o lock no modo
  // lock (default).
  if ((config.isolation || 'lock') === 'lock') {
    const activeLock = await peekActiveProjectLock(origProjectPath)
    if (activeLock) {
      throw new ProjectLockedError(origProjectPath, activeLock)
    }
  }

  // 1. Analyze git (sempre no origProjectPath)
  emit({ phase: 'analyzing', message: 'Analisando projeto...' })
  const gitInfo = await analyzeGitFlow(origProjectPath)

  if (!gitInfo.hasGit) {
    emit({ phase: 'analyzing', message: 'Projeto sem git, executando sem branch' })
  }

  const isWorktreeMode = config.isolation === 'worktree' && createBranch && gitInfo.hasGit

  // 2. Create or reuse branch
  let branchName: string | null = null
  let branchAlreadyExists = false
  if (createBranch && gitInfo.hasGit) {
    branchName = generateBranchName(config.cardType, config.cardTitle)
    const isRetry = (config.attempt || 1) > 1

    try {
      await runCmd('git', ['rev-parse', '--verify', `refs/heads/${branchName}`], origProjectPath)
      branchAlreadyExists = true
    } catch {
      branchAlreadyExists = false
    }

    if (branchAlreadyExists) {
      emit({
        phase: 'branching',
        message: isRetry
          ? `Continuando trabalho em ${branchName} (tentativa ${config.attempt})`
          : `Branch ${branchName} ja existe — fazendo checkout`,
        branch: branchName,
      })
    } else {
      emit({ phase: 'branching', message: `Criando branch ${branchName}...`, branch: branchName })
    }

    // Em modo worktree, a branch sera criada/checkout via 'git worktree add'
    // dentro do worktree (linha mais abaixo). Aqui no working tree principal,
    // nao tocamos pra evitar dirty state.
    if (!isWorktreeMode) {
      try {
        if (branchAlreadyExists) {
          await runCmd('git', ['checkout', branchName], origProjectPath)
        } else {
          await runCmd('git', ['checkout', '-b', branchName], origProjectPath)
          emit({ phase: 'branching', message: `Branch ${branchName} criada`, branch: branchName })
        }
      } catch (err) {
        emit({ phase: 'error', message: `Erro ao criar/trocar branch: ${err instanceof Error ? err.message : 'unknown'}` })
        return
      }
    }
  }

  // 3. Detect installed agents
  const agents = await detectInstalledAgents()
  const agentName = config.agent || agents[0]?.name
  if (!agentName) {
    emit({ phase: 'error', message: 'Nenhum CLI agent encontrado' })
    return
  }

  // 3b. Create session for this execution
  let sessionId: string | null = null
  const wsSlug = config.workspaceSlug
  const cId = config.cardId
  if (wsSlug && cId) {
    const session = await createSession(wsSlug, cId, {
      agent: agentName,
      branch: branchName,
      attempt: config.attempt || 1,
      feedback: config.feedback || null,
    })
    sessionId = session.id
    emit({ phase: 'session-started', sessionId })

    // F9-B — modo worktree: cria worktree isolado. NAO adquire project lock
    // (cada worktree e working tree proprio, paralelismo eh seguro).
    if (isWorktreeMode && branchName) {
      try {
        worktree = await createWorktree(
          origProjectPath,
          sessionId,
          branchName,
          gitInfo.currentBranch || 'main',
        )
        activeProjectPath = worktree.path
        emit({
          phase: 'branching',
          message: `Worktree criado em ${worktree.path.replace(/^\/Users\/[^/]+\//, '~/')}`,
          branch: branchName,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro ao criar worktree'
        await updateSession(wsSlug!, cId!, sessionId, {
          phase: 'error',
          error: msg,
          completedAt: new Date().toISOString(),
        }).catch(() => {})
        emit({ phase: 'error', message: `Worktree falhou: ${msg}` })
        return
      }
    } else {
      // F9-A — modo lock: adquire lock no path original.
      try {
        await acquireProjectLock(origProjectPath, sessionId)
      } catch (lockErr) {
        if (lockErr instanceof ProjectLockedError) {
          await updateSession(wsSlug!, cId!, sessionId, {
            phase: 'error',
            error: lockErr.message,
            completedAt: new Date().toISOString(),
          }).catch(() => {})
        }
        throw lockErr
      }
    }
  }

  // 4. Write feedback (if re-attempt) + task workspace files + copy into project
  let localTaskPath: string | undefined
  if (config.workspaceSlug && config.cardId) {
    // Save feedback before sync
    if (config.feedback && config.attempt) {
      await TaskWorkspace.writeFeedback(config.workspaceSlug, config.cardId, config.feedback, config.attempt - 1)
    }

    // Persist to ~/.cockpit/tasks/ (permanent archive)
    await TaskWorkspace.sync({
      workspaceSlug: config.workspaceSlug,
      cardId: config.cardId,
      title: config.cardTitle,
      type: config.cardType,
      spec: config.spec,
      interviewNotes: config.interviewNotes,
      branch: branchName || undefined,
    })
    const attemptLabel = config.attempt ? ` (tentativa ${config.attempt})` : ''
    await TaskWorkspace.appendImplementationLog(config.workspaceSlug, config.cardId, `Implementacao iniciada${attemptLabel} — agent: ${agentName}, branch: ${branchName || 'N/A'}`)

    // Copy into project dir so agent can read (sandbox-safe).
    // Em modo worktree, copia pro worktree (nao no working tree principal).
    localTaskPath = await TaskWorkspace.copyToProject(config.workspaceSlug, config.cardId, activeProjectPath)
    emit({ phase: 'implementing', message: `Task files copiados para ${localTaskPath}` })
  }

  const prompt = buildImplementationPrompt(config, localTaskPath)

  emit({ phase: 'implementing', message: `Executando ${agentName}...` })

  // 5. File watcher + heartbeat + agent execution — wrapped in try/finally for cleanup
  const seenFiles = new Set<string>()
  let stopWatcher: (() => void) | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  // F-MCP-T3 — AbortController pra suportar abort externo via /agents/sessions/<id>/abort.
  // Quando registerSessionAbort(sessionId, fn) e chamado de fora, fn dispara abortCtrl.abort().
  const abortCtrl = new AbortController()
  if (sessionId) {
    registerSessionAbort(sessionId, () => abortCtrl.abort())
  }

  try {

  if (gitInfo.hasGit) {
    let pollCount = 0
    const pollDelay = () => Math.min(3000 + pollCount * 700, 10000) // 3s → 10s over ~10 polls
    let watchTimer: ReturnType<typeof setTimeout> | null = null

    const pollGitDiff = async () => {
      try {
        const diff = await runCmd('git', ['diff', '--name-status', 'HEAD'], activeProjectPath)
        // Also check untracked files
        const untracked = await runCmd('git', ['ls-files', '--others', '--exclude-standard'], activeProjectPath)

        const lines = diff.trim().split('\n').filter(Boolean)
        for (const line of lines) {
          const parts = line.split('\t')
          if (parts.length < 2) continue
          const [status, filePath] = parts
          const key = `${status}:${filePath}`
          if (!seenFiles.has(key)) {
            seenFiles.add(key)
            const action = (status === 'M' ? 'modified' : status === 'D' ? 'deleted' : 'changed') as SessionFile['action']
            emit({ phase: 'file', action, path: filePath })
            if (wsSlug && cId && sessionId) appendFile(wsSlug, cId, sessionId, { path: filePath, action }).catch(() => {})
          }
        }

        const untrackedLines = untracked.trim().split('\n').filter(Boolean)
        for (const filePath of untrackedLines) {
          const key = `A:${filePath}`
          if (!seenFiles.has(key)) {
            seenFiles.add(key)
            emit({ phase: 'file', action: 'created', path: filePath })
            if (wsSlug && cId && sessionId) appendFile(wsSlug, cId, sessionId, { path: filePath, action: 'created' }).catch(() => {})
          }
        }
      } catch {
        // git might be locked during agent operations
      }
      pollCount++
      watchTimer = setTimeout(pollGitDiff, pollDelay())
    }

    watchTimer = setTimeout(pollGitDiff, pollDelay())
    stopWatcher = () => { if (watchTimer) clearTimeout(watchTimer) }
  }

  // 6. Heartbeat — emit como evento separado (UI mostra como status bar
  // indicator, NAO como linha de log repetida). Isso era spam visual antes.
  const allOutputLines: string[] = []
  let lastChunkAt = Date.now()
  heartbeatInterval = setInterval(() => {
    const silenceSeconds = Math.floor((Date.now() - lastChunkAt) / 1000)
    emit({ phase: 'heartbeat', silenceSeconds })
  }, 5000)

  // 6.5. before_implement hook — gate. Exit != 0 aborta o implement.
  if (config.workspaceSlug && config.cardId && sessionId) {
    const baseHookCtx: HookContext = {
      card_id: config.cardId,
      session_id: sessionId,
      workspace_slug: config.workspaceSlug,
      workspace_name: config.workspaceSlug,  // sem lookup do nome real, usa slug
      branch: branchName || undefined,
      project_path: activeProjectPath,
      agent: agentName,
    }
    const before = await runHook('before_implement', baseHookCtx)
    if (before.ran) {
      emit({ phase: 'implementing', message: formatHookResultLine('before_implement', before) })
      if (before.stdout) emit({ phase: 'output', text: before.stdout })
      if (before.exitCode !== 0) {
        emit({ phase: 'error', message: `before_implement abortou (exit=${before.exitCode}). Stderr: ${before.stderr.slice(0, 200)}` })
        await updateSession(config.workspaceSlug, config.cardId, sessionId, {
          phase: 'error',
          error: `before_implement abortou (exit=${before.exitCode})`,
          completedAt: new Date().toISOString(),
        }).catch(() => {})
        return
      }
    }
  }

  // 7. Execute agent
  try {
    const result = await executeAgentWithCallbacks(
      {
        agent: agentName,
        prompt,
        projectPath: activeProjectPath,
        model: config.model,
      },
      (chunk) => {
        lastChunkAt = Date.now()
        if (chunk.length > 0) {
          const text = chunk.length > 500 ? chunk.slice(0, 497) + '...' : chunk
          emit({ phase: 'output', text })
          allOutputLines.push(chunk)
          // Persist to session (fire-and-forget, batch every few lines)
          if (wsSlug && cId && sessionId && allOutputLines.length % 5 === 0) {
            updateSession(wsSlug, cId, sessionId, { output: [...allOutputLines], phase: 'implementing' }).catch(() => {})
          }
        }
      },
      abortCtrl.signal,
    )

    // Save full log to task workspace
    if (config.workspaceSlug && config.cardId) {
      const logEntry = [
        `\n## Execucao ${new Date().toISOString().slice(0, 19)}`,
        `Agent: ${agentName} | Branch: ${branchName || 'N/A'} | Exit: ${result.exitCode} | Duracao: ${Math.round(result.duration / 1000)}s`,
        '',
        ...allOutputLines.map((l) => `  ${l}`),
        '',
      ].join('\n')
      await TaskWorkspace.appendImplementationLog(config.workspaceSlug, config.cardId, logEntry)
    }

    // Final git diff for summary
    let filesModified = 0
    let filesCreated = 0
    let filesDeleted = 0

    if (gitInfo.hasGit) {
      try {
        const finalDiff = await runCmd('git', ['diff', '--name-status', 'HEAD'], activeProjectPath)
        const untracked = await runCmd('git', ['ls-files', '--others', '--exclude-standard'], activeProjectPath)

        for (const line of finalDiff.trim().split('\n').filter(Boolean)) {
          const status = line.split('\t')[0]
          if (status === 'M') filesModified++
          else if (status === 'D') filesDeleted++
        }
        filesCreated = untracked.trim().split('\n').filter(Boolean).length
      } catch { /* ok */ }
    }

    const summary = { filesModified, filesCreated, filesDeleted, branch: branchName } as {
      filesModified: number; filesCreated: number; filesDeleted: number; branch: string | null; prUrl?: string; prNumber?: number
    }

    // Hook after_implement — informativo (nao para fluxo). Roda antes de PR.
    if (config.workspaceSlug && config.cardId && sessionId && result.exitCode === 0) {
      const after = await runHook('after_implement', {
        card_id: config.cardId,
        session_id: sessionId,
        workspace_slug: config.workspaceSlug,
        workspace_name: config.workspaceSlug,
        branch: branchName || undefined,
        project_path: activeProjectPath,
        agent: agentName,
        summary_json: JSON.stringify(summary),
      })
      if (after.ran) {
        emit({ phase: 'implementing', message: formatHookResultLine('after_implement', after) })
        if (after.stdout) emit({ phase: 'output', text: after.stdout })
      }
    }

    // Auto-PR: create draft PR if enabled and implementation succeeded
    if (config.autoPR && branchName && result.exitCode === 0) {
      emit({ phase: 'creating-pr', message: 'Criando Pull Request...' })
      try {
        const pr = await createPR({
          projectPath: activeProjectPath,
          branch: branchName,
          cardTitle: config.cardTitle,
          cardType: config.cardType,
          spec: config.spec,
          filesModified,
          filesCreated,
          filesDeleted,
          draft: true,
        })
        summary.prUrl = pr.url
        summary.prNumber = pr.number
        emit({ phase: 'creating-pr', message: `PR #${pr.number} criada: ${pr.url}` })

        // F-PR — atualiza Card.pr_url no kv_stores pra UI (Card detail,
        // Live Agents) poder fetch status sem ter que olhar a session.
        if (config.cardId) {
          try {
            await updateCardPrUrl(config.cardId, pr.url)
          } catch (e) {
            console.warn('[implement] falha ao salvar pr_url no card:', e)
          }
        }

        // Hook after_pr — informativo. Slack notify, deploy preview, etc.
        if (config.workspaceSlug && config.cardId && sessionId) {
          const afterPr = await runHook('after_pr', {
            card_id: config.cardId,
            session_id: sessionId,
            workspace_slug: config.workspaceSlug,
            workspace_name: config.workspaceSlug,
            branch: branchName || undefined,
            project_path: activeProjectPath,
            agent: agentName,
            pr_url: pr.url,
            pr_number: String(pr.number),
            summary_json: JSON.stringify(summary),
          })
          if (afterPr.ran) {
            emit({ phase: 'creating-pr', message: formatHookResultLine('after_pr', afterPr) })
            if (afterPr.stdout) emit({ phase: 'output', text: afterPr.stdout })
          }
        }
      } catch (prErr) {
        emit({ phase: 'creating-pr', message: `PR falhou: ${prErr instanceof Error ? prErr.message : 'erro'}` })
      }
    }

    // Finalize session — detecta abort via signal.aborted (exitCode varia por OS/agent)
    const wasAborted = abortCtrl.signal.aborted
    const finalPhase = wasAborted ? 'error' : 'done'
    if (wsSlug && cId && sessionId) {
      await updateSession(wsSlug, cId, sessionId, {
        phase: finalPhase,
        exitCode: result.exitCode,
        completedAt: new Date().toISOString(),
        duration: Math.round(result.duration / 1000),
        summary,
        output: allOutputLines,
        error: wasAborted ? 'session abortada via cockpit_abort_session ou Web UI' : undefined,
      })
    }

    if (wasAborted) {
      emit({ phase: 'error', message: 'session abortada' })
    } else {
      emit({
        phase: 'done',
        message: `${agentName} concluido (${Math.round(result.duration / 1000)}s)`,
        summary,
        exitCode: result.exitCode,
      })
    }
  } catch (err) {
    // Finalize session with error
    if (wsSlug && cId && sessionId) {
      await updateSession(wsSlug, cId, sessionId, {
        phase: 'error',
        error: err instanceof Error ? err.message : 'Erro desconhecido',
        completedAt: new Date().toISOString(),
        output: allOutputLines,
      }).catch(() => {})
    }

    emit({ phase: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
  }

  } finally {
    // Guaranteed cleanup of intervals regardless of success/error path
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    stopWatcher?.()
    // F-MCP-T3 — desregistra abort handler (registry vira no-op se chamado de novo)
    if (sessionId) unregisterSessionAbort(sessionId)
    // F9-A — libera o lock do projeto. Idempotente; nao falha se ja foi
    // liberado ou se nunca foi adquirido (worktree mode pula acquire).
    if (sessionId && !isWorktreeMode) releaseProjectLock(origProjectPath, sessionId)
    // F9-B — remove o worktree. forceRemove=false preserva dirty state pra
    // inspecao manual (warning no log do daemon). Path do worktree fica
    // disponivel via session.summary se branch tinha edits nao commitados.
    if (worktree && sessionId) {
      try {
        await removeWorktree(origProjectPath, sessionId, { forceRemove: false })
      } catch (err) {
        console.warn(`[runImplementation] worktree cleanup falhou (${sessionId}):`, err)
      }
    }
  }
}

// F-PR — atualiza Card.pr_url no kv_stores. Read-modify-write via daemon
// (mesmo padrao que CLI/MCP usam externamente, mas aqui acessa direto o DB).
async function updateCardPrUrl(cardId: string, prUrl: string): Promise<void> {
  const { getDB } = await import('../persistence/db')
  const db = getDB()
  const row = db.query('SELECT data FROM kv_stores WHERE store_name = ?').get('cards') as { data: string } | null
  if (!row) return
  const env = JSON.parse(row.data) as { state?: { cards?: Array<Record<string, unknown>> }; version?: number; _ts?: number }
  if (!env.state?.cards) return
  const now = new Date().toISOString()
  let changed = false
  env.state.cards = env.state.cards.map((c) => {
    if (c.id === cardId) {
      changed = true
      return { ...c, pr_url: prUrl, updated_at: now }
    }
    return c
  })
  if (!changed) return
  env._ts = Date.now()
  db.query(
    'INSERT OR REPLACE INTO kv_stores (store_name, data, updated_at) VALUES (?, ?, ?)',
  ).run('cards', JSON.stringify(env), now)
}
