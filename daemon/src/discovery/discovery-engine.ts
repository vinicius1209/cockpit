import { scanProject, type ProjectScanResult, type TodoItem } from '../scanner/project-scanner'
import { executeAgent, detectInstalledAgents } from '../executor/agent-executor'
import { todosToCards, buildDiscoveryAgentPrompt } from './discovery-engine-utils'

export interface DiscoveryCard {
  title: string
  description: string
  type: 'bugfix' | 'improvement' | 'chore' | 'discovery'
  priority: 'critical' | 'high' | 'medium' | 'low'
  source: 'scanner' | 'agent'
  metadata: Record<string, string>
  subProject?: string
}

export interface DiscoveryResult {
  project: string
  scannedAt: string
  cards: DiscoveryCard[]
  scanResult: ProjectScanResult
}

export async function runDiscovery(projectPath: string, agentName?: string, model?: string): Promise<DiscoveryResult> {
  const scanResult = await scanProject(projectPath)
  const cards: DiscoveryCard[] = []
  const subProjectNames = scanResult.subProjects.map((sp) => sp.name)

  // 1. Cards from TODOs/FIXMEs
  cards.push(...todosToCards(scanResult.todos, subProjectNames))

  // 2. Cards from git status
  if (scanResult.git && scanResult.git.uncommittedChanges > 5) {
    cards.push({
      title: `${scanResult.git.uncommittedChanges} arquivos não commitados`,
      description: `O projeto "${scanResult.name}" tem ${scanResult.git.uncommittedChanges} mudancas não commitadas na branch ${scanResult.git.branch}. Considere commitar ou fazer stash.`,
      type: 'chore',
      priority: 'medium',
      source: 'scanner',
      metadata: { branch: scanResult.git.branch },
    })
  }

  // 3. Cards from missing configs
  if (!scanResult.agentConfigs.hasAgentsMd && !scanResult.agentConfigs.hasClaudeDir) {
    cards.push({
      title: `Configurar agents para ${scanResult.name}`,
      description: `O projeto não tem AGENTS.md nem diretório .claude/. Configurar isso melhora a experiencia com AI code agents.`,
      type: 'improvement',
      priority: 'low',
      source: 'scanner',
      metadata: {},
    })
  }

  // 4. Optional: deep analysis with CLI agent
  if (agentName) {
    const agentCards = await runAgentDiscovery(scanResult, agentName, model)
    cards.push(...agentCards)
  }

  return {
    project: scanResult.name,
    scannedAt: new Date().toISOString(),
    cards,
    scanResult,
  }
}

function inferSubProject(filePath: string, subProjectNames: string[]): string | undefined {
  const firstSegment = filePath.split('/')[0]
  return subProjectNames.includes(firstSegment) ? firstSegment : undefined
}

// todosToCards imported from discovery-engine-utils (single source of truth)

async function runAgentDiscovery(scanResult: ProjectScanResult, agentName: string, model?: string): Promise<DiscoveryCard[]> {
  const agents = await detectInstalledAgents()
  const agent = agents.find((a) => a.name === agentName)
  if (!agent) return []

  const prompt = buildDiscoveryAgentPrompt(scanResult)

  try {
    const result = await executeAgent({
      agent: agentName,
      prompt,
      projectPath: scanResult.path,
      model,
    })

    if (result.exitCode !== 0) return []

    const jsonMatch = result.output.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed.slice(0, 15).map((item: Record<string, string>) => ({
      title: String(item.title || '').slice(0, 120),
      description: String(item.description || ''),
      type: (['bugfix', 'improvement', 'chore', 'discovery'].includes(item.type) ? item.type : 'discovery') as DiscoveryCard['type'],
      priority: (['critical', 'high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium') as DiscoveryCard['priority'],
      source: 'agent' as const,
      metadata: { agent: agentName },
      subProject: item.subProject && item.subProject !== 'null' ? item.subProject : undefined,
    }))
  } catch {
    return []
  }
}
