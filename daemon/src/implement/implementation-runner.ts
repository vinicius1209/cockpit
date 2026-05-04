import { executeAgentWithCallbacks, detectInstalledAgents } from '../executor/agent-executor'
import { TaskWorkspace } from '../tasks/task-workspace'
import { createPR } from '../git/pr-creator'

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
}

export interface ImplementEvent {
  phase: 'analyzing' | 'branching' | 'implementing' | 'output' | 'file' | 'creating-pr' | 'done' | 'error'
  message?: string
  text?: string
  branch?: string
  action?: 'modified' | 'created' | 'deleted' | 'changed'
  path?: string
  summary?: { filesModified: number; filesCreated: number; filesDeleted: number; branch: string | null; prUrl?: string; prNumber?: number }
  exitCode?: number
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
  const { projectPath, createBranch } = config

  // 1. Analyze git
  emit({ phase: 'analyzing', message: 'Analisando projeto...' })
  const gitInfo = await analyzeGitFlow(projectPath)

  if (!gitInfo.hasGit) {
    emit({ phase: 'analyzing', message: 'Projeto sem git, executando sem branch' })
  }

  // 2. Create branch
  let branchName: string | null = null
  if (createBranch && gitInfo.hasGit) {
    branchName = generateBranchName(config.cardType, config.cardTitle)
    emit({ phase: 'branching', message: `Criando branch ${branchName}...`, branch: branchName })

    try {
      // Try to create new branch, if exists checkout existing
      try {
        await runCmd('git', ['checkout', '-b', branchName], projectPath)
        emit({ phase: 'branching', message: `Branch ${branchName} criada`, branch: branchName })
      } catch {
        // Branch already exists, checkout it
        await runCmd('git', ['checkout', branchName], projectPath)
        emit({ phase: 'branching', message: `Branch ${branchName} (existente)`, branch: branchName })
      }
    } catch (err) {
      emit({ phase: 'error', message: `Erro ao criar/trocar branch: ${err instanceof Error ? err.message : 'unknown'}` })
      return
    }
  }

  // 3. Detect installed agents
  const agents = await detectInstalledAgents()
  const agentName = config.agent || agents[0]?.name
  if (!agentName) {
    emit({ phase: 'error', message: 'Nenhum CLI agent encontrado' })
    return
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

    // Copy into project dir so agent can read (sandbox-safe)
    localTaskPath = await TaskWorkspace.copyToProject(config.workspaceSlug, config.cardId, projectPath)
    emit({ phase: 'implementing', message: `Task files copiados para ${localTaskPath}` })
  }

  const prompt = buildImplementationPrompt(config, localTaskPath)

  emit({ phase: 'implementing', message: `Executando ${agentName}...` })

  // 5. File watcher (git diff polling)
  const seenFiles = new Set<string>()
  let stopWatcher: (() => void) | null = null

  if (gitInfo.hasGit) {
    const watchInterval = setInterval(async () => {
      try {
        const diff = await runCmd('git', ['diff', '--name-status', 'HEAD'], projectPath)
        // Also check untracked files
        const untracked = await runCmd('git', ['ls-files', '--others', '--exclude-standard'], projectPath)

        const lines = diff.trim().split('\n').filter(Boolean)
        for (const line of lines) {
          const parts = line.split('\t')
          if (parts.length < 2) continue
          const [status, filePath] = parts
          const key = `${status}:${filePath}`
          if (!seenFiles.has(key)) {
            seenFiles.add(key)
            emit({
              phase: 'file',
              action: status === 'M' ? 'modified' : status === 'D' ? 'deleted' : 'changed',
              path: filePath,
            })
          }
        }

        const untrackedLines = untracked.trim().split('\n').filter(Boolean)
        for (const filePath of untrackedLines) {
          const key = `A:${filePath}`
          if (!seenFiles.has(key)) {
            seenFiles.add(key)
            emit({ phase: 'file', action: 'created', path: filePath })
          }
        }
      } catch {
        // git might be locked during agent operations
      }
    }, 3000)

    stopWatcher = () => clearInterval(watchInterval)
  }

  // 6. Heartbeat — emit a single updating status (not output lines)
  const allOutputLines: string[] = []
  let lastChunkAt = Date.now()
  const heartbeatInterval = setInterval(() => {
    const silenceSeconds = Math.floor((Date.now() - lastChunkAt) / 1000)
    if (silenceSeconds >= 5) {
      emit({ phase: 'implementing', message: `Agent trabalhando... (${silenceSeconds}s)` })
    }
  }, 10000)

  // 7. Execute agent
  try {
    const result = await executeAgentWithCallbacks(
      {
        agent: agentName,
        prompt,
        projectPath,
        model: config.model,
      },
      (chunk) => {
        lastChunkAt = Date.now()
        if (chunk.length > 0) {
          // Truncate very long lines but don't filter them out
          const text = chunk.length > 500 ? chunk.slice(0, 497) + '...' : chunk
          emit({ phase: 'output', text })
          allOutputLines.push(chunk)
        }
      },
    )

    clearInterval(heartbeatInterval)
    stopWatcher?.()

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
        const finalDiff = await runCmd('git', ['diff', '--name-status', 'HEAD'], projectPath)
        const untracked = await runCmd('git', ['ls-files', '--others', '--exclude-standard'], projectPath)

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

    // Auto-PR: create draft PR if enabled and implementation succeeded
    if (config.autoPR && branchName && result.exitCode === 0) {
      emit({ phase: 'creating-pr', message: 'Criando Pull Request...' })
      try {
        const pr = await createPR({
          projectPath,
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
      } catch (prErr) {
        emit({ phase: 'creating-pr', message: `PR falhou: ${prErr instanceof Error ? prErr.message : 'erro'}` })
      }
    }

    // Save last result to meta for state restoration
    if (config.workspaceSlug && config.cardId) {
      await TaskWorkspace.writeMeta(config.workspaceSlug, config.cardId, {
        lastRun: {
          phase: 'done',
          exitCode: result.exitCode,
          branch: branchName,
          summary,
          duration: Math.round(result.duration / 1000),
          agent: agentName,
          attempt: config.attempt || 1,
          completedAt: new Date().toISOString(),
        },
      })
    }

    emit({
      phase: 'done',
      message: `${agentName} concluido (${Math.round(result.duration / 1000)}s)`,
      summary,
      exitCode: result.exitCode,
    })
  } catch (err) {
    clearInterval(heartbeatInterval)
    stopWatcher?.()

    // Save error to meta
    if (config.workspaceSlug && config.cardId) {
      await TaskWorkspace.writeMeta(config.workspaceSlug, config.cardId, {
        lastRun: {
          phase: 'error',
          error: err instanceof Error ? err.message : 'Erro desconhecido',
          attempt: config.attempt || 1,
          completedAt: new Date().toISOString(),
        },
      }).catch(() => {})
    }

    emit({ phase: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
  }
}
