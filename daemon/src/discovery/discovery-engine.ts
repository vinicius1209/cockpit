import { scanProject, type ProjectScanResult, type TodoItem } from '../scanner/project-scanner'
import { executeAgent, detectInstalledAgents } from '../executor/agent-executor'

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

export async function runDiscovery(projectPath: string, agentName?: string): Promise<DiscoveryResult> {
  const scanResult = await scanProject(projectPath)
  const cards: DiscoveryCard[] = []
  const subProjectNames = scanResult.subProjects.map((sp) => sp.name)

  // 1. Cards from TODOs/FIXMEs
  cards.push(...todosToCards(scanResult.todos, subProjectNames))

  // 2. Cards from git status
  if (scanResult.git && scanResult.git.uncommittedChanges > 5) {
    cards.push({
      title: `${scanResult.git.uncommittedChanges} arquivos nao commitados`,
      description: `O projeto "${scanResult.name}" tem ${scanResult.git.uncommittedChanges} mudancas nao commitadas na branch ${scanResult.git.branch}. Considere commitar ou fazer stash.`,
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
      description: `O projeto nao tem AGENTS.md nem diretorio .claude/. Configurar isso melhora a experiencia com AI code agents.`,
      type: 'improvement',
      priority: 'low',
      source: 'scanner',
      metadata: {},
    })
  }

  // 4. Optional: deep analysis with CLI agent
  if (agentName) {
    const agentCards = await runAgentDiscovery(scanResult, agentName)
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

function todosToCards(todos: TodoItem[], subProjectNames: string[]): DiscoveryCard[] {
  const fixmes = todos.filter((t) => t.type === 'FIXME' || t.type === 'BUG')
  const hacks = todos.filter((t) => t.type === 'HACK')
  const regularTodos = todos.filter((t) => t.type === 'TODO')

  const cards: DiscoveryCard[] = []

  for (const fixme of fixmes.slice(0, 10)) {
    cards.push({
      title: `FIXME: ${fixme.text.replace(/\/\/\s*(FIXME|BUG):?\s*/i, '').slice(0, 80)}`,
      description: `Encontrado em ${fixme.file}:${fixme.line}\n\n\`\`\`\n${fixme.text}\n\`\`\``,
      type: 'bugfix',
      priority: 'high',
      source: 'scanner',
      metadata: { file: fixme.file, line: String(fixme.line) },
      subProject: inferSubProject(fixme.file, subProjectNames),
    })
  }

  if (hacks.length > 0) {
    cards.push({
      title: `${hacks.length} HACKs encontrados no codigo`,
      description: `Locais:\n${hacks.slice(0, 10).map((h) => `- ${h.file}:${h.line} — ${h.text.slice(0, 100)}`).join('\n')}`,
      type: 'improvement',
      priority: 'medium',
      source: 'scanner',
      metadata: { count: String(hacks.length) },
    })
  }

  if (regularTodos.length > 5) {
    cards.push({
      title: `${regularTodos.length} TODOs pendentes no codigo`,
      description: `Exemplos:\n${regularTodos.slice(0, 10).map((t) => `- ${t.file}:${t.line} — ${t.text.slice(0, 100)}`).join('\n')}`,
      type: 'chore',
      priority: 'low',
      source: 'scanner',
      metadata: { count: String(regularTodos.length) },
    })
  }

  return cards
}

async function runAgentDiscovery(scanResult: ProjectScanResult, agentName: string): Promise<DiscoveryCard[]> {
  const agents = await detectInstalledAgents()
  const agent = agents.find((a) => a.name === agentName)
  if (!agent) return []

  const subProjectList = scanResult.subProjects.length > 0
    ? `\nSub-projetos: ${scanResult.subProjects.map((sp) => `${sp.name} (${sp.indicator})`).join(', ')}`
    : ''

  const prompt = `Analise este projeto e retorne SOMENTE um JSON array com problemas, debitos tecnicos e melhorias encontrados.

Projeto: ${scanResult.name}
Stack: ${scanResult.stack.join(', ')}
Branch: ${scanResult.git?.branch || 'unknown'}
Git status: ${scanResult.git?.status || 'unknown'}
Dependencias: ${Object.keys(scanResult.dependencies).join(', ')}
Estrutura (resumo): ${scanResult.structure.slice(0, 20).join(', ')}${subProjectList}

Formato de resposta (JSON puro, sem markdown):
[
  {
    "title": "descricao curta",
    "description": "descricao detalhada",
    "type": "bugfix|improvement|chore|discovery",
    "priority": "critical|high|medium|low",
    "subProject": "nome-do-sub-projeto-se-aplicavel-ou-null"
  }
]`

  try {
    const result = await executeAgent({
      agent: agentName,
      prompt,
      projectPath: scanResult.path,
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
