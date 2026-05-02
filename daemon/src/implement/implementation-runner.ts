import { executeAgentWithCallbacks, detectInstalledAgents } from '../executor/agent-executor'

export interface ImplementConfig {
  cardTitle: string
  cardType: string
  spec: string
  interviewNotes?: string
  projectPath: string
  agent?: string
  model?: string
  createBranch: boolean
}

export interface ImplementEvent {
  phase: 'analyzing' | 'branching' | 'implementing' | 'output' | 'file' | 'done' | 'error'
  message?: string
  text?: string
  branch?: string
  action?: 'modified' | 'created' | 'deleted' | 'changed'
  path?: string
  summary?: { filesModified: number; filesCreated: number; filesDeleted: number; branch: string | null }
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

function buildImplementationPrompt(config: ImplementConfig): string {
  const parts: string[] = []

  parts.push(`Voce recebeu uma spec tecnica para implementar. Implemente as mudancas no codigo deste projeto.`)
  parts.push('')
  parts.push(`## Card`)
  parts.push(`Titulo: ${config.cardTitle}`)
  parts.push(`Tipo: ${config.cardType}`)
  parts.push('')
  parts.push(`## Spec Tecnica`)
  parts.push(config.spec)

  if (config.interviewNotes) {
    parts.push('')
    parts.push(`## Notas da Entrevista`)
    parts.push(config.interviewNotes)
  }

  parts.push('')
  parts.push(`## Instrucoes`)
  parts.push(`1. Leia os arquivos relevantes mencionados na spec`)
  parts.push(`2. Implemente TODAS as mudancas descritas nos Requisitos Funcionais`)
  parts.push(`3. Siga as convencoes do projeto existente`)
  parts.push(`4. Crie testes se a spec mencionar`)
  parts.push(`5. Nao altere arquivos nao relacionados a spec`)
  parts.push(`6. Use portugues brasileiro para textos de UI`)
  parts.push(`7. Faca commits atomicos com mensagens descritivas`)

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
      await runCmd('git', ['checkout', '-b', branchName], projectPath)
      emit({ phase: 'branching', message: `Branch ${branchName} criada`, branch: branchName })
    } catch (err) {
      emit({ phase: 'error', message: `Erro ao criar branch: ${err instanceof Error ? err.message : 'unknown'}` })
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

  // 4. Build prompt
  const prompt = buildImplementationPrompt(config)

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

  // 6. Execute agent
  try {
    const result = await executeAgentWithCallbacks(
      {
        agent: agentName,
        prompt,
        projectPath,
        model: config.model,
      },
      (chunk) => {
        if (chunk.length > 0 && chunk.length < 500) {
          emit({ phase: 'output', text: chunk })
        }
      },
    )

    stopWatcher?.()

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

    emit({
      phase: 'done',
      message: `${agentName} concluido (${Math.round(result.duration / 1000)}s)`,
      summary: { filesModified, filesCreated, filesDeleted, branch: branchName },
      exitCode: result.exitCode,
    })
  } catch (err) {
    stopWatcher?.()
    emit({ phase: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
  }
}
