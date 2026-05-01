import { scanProject } from '../scanner/project-scanner'
import { executeAgent, detectInstalledAgents } from '../executor/agent-executor'
import { diffScan } from './scan-differ'
import type { DiscoveryCard, DiscoveryResult } from './discovery-engine'

export type JobStatus = 'queued' | 'scanning' | 'running-agent' | 'diffing' | 'completed' | 'failed'

export interface JobProgress {
  timestamp: string
  phase: JobStatus
  message: string
  detail?: string
}

export interface DiscoveryJob {
  id: string
  projectPath: string
  agent?: string
  status: JobStatus
  createdAt: string
  completedAt: string | null
  progress: JobProgress[]
  result: (DiscoveryResult & { diff?: Record<string, unknown> }) | null
  error: string | null
}

const jobStore = new Map<string, DiscoveryJob>()
const jobListeners = new Map<string, Set<(event: JobProgress) => void>>()

function emitProgress(jobId: string, phase: JobStatus, message: string, detail?: string) {
  const job = jobStore.get(jobId)
  if (!job) return

  const event: JobProgress = {
    timestamp: new Date().toISOString(),
    phase,
    message,
    detail,
  }

  job.progress.push(event)
  job.status = phase

  const listeners = jobListeners.get(jobId)
  if (listeners) {
    for (const listener of listeners) {
      listener(event)
    }
  }
}

export function createJob(projectPath: string, agent?: string): DiscoveryJob {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`

  const job: DiscoveryJob = {
    id,
    projectPath,
    agent,
    status: 'queued',
    createdAt: new Date().toISOString(),
    completedAt: null,
    progress: [],
    result: null,
    error: null,
  }

  jobStore.set(id, job)
  return job
}

export function getJob(id: string): DiscoveryJob | undefined {
  return jobStore.get(id)
}

export function subscribeToJob(jobId: string, listener: (event: JobProgress) => void): () => void {
  let listeners = jobListeners.get(jobId)
  if (!listeners) {
    listeners = new Set()
    jobListeners.set(jobId, listeners)
  }
  listeners.add(listener)

  return () => {
    listeners!.delete(listener)
    if (listeners!.size === 0) {
      jobListeners.delete(jobId)
    }
  }
}

export async function executeJobAsync(jobId: string): Promise<void> {
  const job = jobStore.get(jobId)
  if (!job) return

  try {
    // Phase 1: Scanning
    emitProgress(jobId, 'scanning', `Escaneando ${job.projectPath.split('/').pop()}...`)
    const scanResult = await scanProject(job.projectPath)
    const subProjectNames = scanResult.subProjects.map((sp) => sp.name)

    emitProgress(jobId, 'scanning', `Scan concluido: ${scanResult.structure.length} itens, ${scanResult.todos.length} TODOs`)

    // Build cards from scanner
    const cards: DiscoveryCard[] = []

    // TODOs
    const { todosToCards } = await import('./discovery-engine-utils')
    cards.push(...todosToCards(scanResult.todos, subProjectNames))

    // Git status
    if (scanResult.git && scanResult.git.uncommittedChanges > 5) {
      cards.push({
        title: `${scanResult.git.uncommittedChanges} arquivos nao commitados`,
        description: `O projeto tem ${scanResult.git.uncommittedChanges} mudancas nao commitadas na branch ${scanResult.git.branch}.`,
        type: 'chore',
        priority: 'medium',
        source: 'scanner',
        metadata: { branch: scanResult.git.branch },
      })
    }

    // Missing configs
    if (!scanResult.agentConfigs.hasAgentsMd && !scanResult.agentConfigs.hasClaudeDir) {
      cards.push({
        title: `Configurar agents para ${scanResult.name}`,
        description: `O projeto nao tem AGENTS.md nem diretorio .claude/.`,
        type: 'improvement',
        priority: 'low',
        source: 'scanner',
        metadata: {},
      })
    }

    // Phase 2: Agent (if selected)
    if (job.agent) {
      emitProgress(jobId, 'running-agent', `Executando ${job.agent}...`)

      const agents = await detectInstalledAgents()
      const agentDef = agents.find((a) => a.name === job.agent)

      if (agentDef) {
        const subProjectList = scanResult.subProjects.length > 0
          ? `\nSub-projetos: ${scanResult.subProjects.map((sp) => `${sp.name} (${sp.indicator})`).join(', ')}`
          : ''

        const prompt = `Analise este projeto e retorne SOMENTE um JSON array com problemas, debitos tecnicos e melhorias encontrados.

Projeto: ${scanResult.name}
Stack: ${scanResult.stack.join(', ')}
Branch: ${scanResult.git?.branch || 'unknown'}
Dependencias: ${Object.keys(scanResult.dependencies).join(', ')}
Estrutura: ${scanResult.structure.slice(0, 20).join(', ')}${subProjectList}

Formato de resposta (JSON puro, sem markdown):
[{"title":"descricao curta","description":"descricao detalhada","type":"bugfix|improvement|chore|discovery","priority":"critical|high|medium|low","subProject":"nome-ou-null"}]`

        try {
          // Heartbeat every 5s to keep SSE connection alive during long agent runs
          const heartbeat = setInterval(() => {
            emitProgress(jobId, 'running-agent', `${job.agent} executando...`)
          }, 5000)

          const result = await executeAgent({
            agent: job.agent,
            prompt,
            projectPath: scanResult.path,
          })

          clearInterval(heartbeat)
          emitProgress(jobId, 'running-agent', `${job.agent} concluido (${Math.round(result.duration / 1000)}s)`)

          if (result.exitCode === 0) {
            const jsonMatch = result.output.match(/\[[\s\S]*\]/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              if (Array.isArray(parsed)) {
                const agentCards: DiscoveryCard[] = parsed.slice(0, 15).map((item: Record<string, string>) => ({
                  title: String(item.title || '').slice(0, 120),
                  description: String(item.description || ''),
                  type: (['bugfix', 'improvement', 'chore', 'discovery'].includes(item.type) ? item.type : 'discovery') as DiscoveryCard['type'],
                  priority: (['critical', 'high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium') as DiscoveryCard['priority'],
                  source: 'agent' as const,
                  metadata: { agent: job.agent! },
                  subProject: item.subProject && item.subProject !== 'null' ? item.subProject : undefined,
                }))
                cards.push(...agentCards)
                emitProgress(jobId, 'running-agent', `${agentCards.length} findings do agent`)
              }
            }
          }
        } catch (err) {
          clearInterval(heartbeat)
          emitProgress(jobId, 'running-agent', `Erro no agent: ${err instanceof Error ? err.message : 'unknown'}`)
        }
      }
    }

    // Phase 3: Diffing
    emitProgress(jobId, 'diffing', 'Calculando diff com scan anterior...')
    const diff = diffScan(job.projectPath, cards)

    const discoveryResult: DiscoveryResult = {
      project: scanResult.name,
      scannedAt: new Date().toISOString(),
      cards,
      scanResult,
    }

    job.result = {
      ...discoveryResult,
      diff: {
        newCount: diff.newFindings.length,
        baselineCount: diff.baselineFindings.length,
        existingCount: diff.existingFindings.length,
        resolvedCount: diff.resolvedFindings.length,
        findings: diff.findings.map((f) => ({
          ...f.card,
          fingerprint: f.fingerprint,
          status: f.status,
          firstSeen: f.firstSeen,
          linkedCardId: f.linkedCardId,
        })),
        resolved: diff.resolvedFindings.map((f) => ({
          ...f.card,
          fingerprint: f.fingerprint,
          firstSeen: f.firstSeen,
          resolvedAt: f.lastSeen,
        })),
      },
    }

    job.completedAt = new Date().toISOString()
    emitProgress(jobId, 'completed', `Discovery concluido: ${cards.length} descobertas`)
  } catch (err) {
    job.error = err instanceof Error ? err.message : 'Erro desconhecido'
    job.completedAt = new Date().toISOString()
    emitProgress(jobId, 'failed', job.error)
  }
}
