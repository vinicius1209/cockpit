import { loadAll } from '../api/store'
import { resolveCard, shortId } from '../api/resolve'
import { c, sym } from '../ui/colors'
import { divider } from '../ui/box'
import { postSSE } from '../api/sse'
import { createStreamRenderer, renderChunk, flushOutputBuffer } from '../ui/stream-render'
import { createInterface } from 'node:readline'

const DEFAULT_AGENT_ROLE = 'analyzer' // melhor pra free chat

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

interface AgentConfig {
  name: string
  role: string
  provider: string
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
  enabled: boolean
}

interface AgentEnvelope {
  state?: { configs?: Record<string, AgentConfig[]> }
}

export async function ai(ref: string): Promise<void> {
  const { workspaces, cards, projects } = await loadAll()
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

  // Carrega agente (pega analyzer ou primeiro non-interviewer)
  const { rawFetch } = await import('../api/client')
  const agentsRes = await rawFetch('/api/data/agents')
  const env = await agentsRes.json() as AgentEnvelope
  const wsAgents = env.state?.configs?.[ws.id] || []
  const enabled = wsAgents.filter((a: AgentConfig) => a.enabled)
  const agent = enabled.find((a: AgentConfig) => a.role === DEFAULT_AGENT_ROLE)
    || enabled.find((a: AgentConfig) => a.role !== 'interviewer')
    || enabled[0]
  if (!agent) {
    console.error(c.rose('✕ workspace nao tem agentes configurados'))
    process.exit(1)
  }

  const project = card.project_id
    ? projects.find((p) => p.id === card.project_id)
    : projects.find((p) => p.workspace_id === ws.id)

  const enrichedSystemPrompt = buildSystemPrompt(agent.system_prompt, card, project)

  // Header
  console.log(divider(`AI CHAT · #${shortId(card.id)}`, 'cyan'))
  console.log(`  ${c.bold(card.title)}`)
  console.log(`  ${c.dim('agente:')} ${agent.name} ${c.dim('· model:')} ${agent.model}`)
  console.log(`  ${c.dim('contexto:')} card + projeto`)
  console.log()
  console.log(c.dim('  comandos: /exit /clear /copy /help'))
  console.log(c.dim('  multiline: Esc + Enter envia (single Enter eh nova linha)'))
  console.log()

  const messages: Message[] = []

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.cyan('▸ ') as string,
    terminal: true,
  })

  rl.prompt()

  rl.on('line', async (input) => {
    const text = input.trim()
    if (!text) {
      rl.prompt()
      return
    }

    if (text === '/exit' || text === '/quit') {
      rl.close()
      return
    }
    if (text === '/clear') {
      messages.length = 0
      console.clear()
      console.log(c.dim('━ contexto limpo (sem messages)'))
      rl.prompt()
      return
    }
    if (text === '/help') {
      console.log(c.dim('  /exit /quit  sair'))
      console.log(c.dim('  /clear       limpar messages (mantem system prompt)'))
      console.log(c.dim('  /copy        copia resposta do assistente'))
      rl.prompt()
      return
    }

    messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() })
    rl.pause()

    process.stdout.write(c.dim('  pensando…'))
    const renderer = createStreamRenderer()
    let firstChunk = true
    let assistantText = ''

    try {
      await postSSE(
        '/chat/run',
        {
          systemPrompt: enrichedSystemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          model: agent.model,
          projectPath: project?.path,
          cardId: card.id,
          workspaceSlug: ws.slug,
          action: 'chat',
        },
        (event) => {
          if (event.type === 'chunk' && typeof event.text === 'string') {
            if (firstChunk) {
              process.stdout.write('\r' + ' '.repeat(20) + '\r')  // limpa "pensando..."
              process.stdout.write(c.emerald('◇ '))
              firstChunk = false
            }
            assistantText += event.text
            renderChunk({ kind: 'output', text: event.text, state: renderer })
          }
          if (event.type === 'error') {
            flushOutputBuffer(renderer)
            console.log()
            console.log(c.rose('✕ ') + (event.message || 'erro'))
          }
        },
      )
    } catch (err) {
      console.log()
      console.log(c.rose('✕ ') + (err as Error).message)
    }

    flushOutputBuffer(renderer)
    if (assistantText) {
      messages.push({ role: 'assistant', content: assistantText, timestamp: new Date().toISOString() })
    }
    console.log()
    rl.resume()
    rl.prompt()
  })

  rl.on('close', () => {
    console.log()
    console.log(c.dim(`━ chat encerrado (${messages.length / 2 | 0} turnos)`))
    process.exit(0)
  })
}

function buildSystemPrompt(base: string, card: { title: string; type: string; priority: string; description: string | null; spec_content: string | null; spec_status: string | null; interview_notes: string | null }, project: { name: string; path: string } | undefined): string {
  const parts: string[] = []
  if (base) parts.push(base.trim())

  parts.push(`## Escopo da conversa
Voce esta conversando sobre UM card especifico. Responda APENAS dentro do escopo do card e do projeto vinculado.
- NAO faca perguntas sobre informacoes que ja estao no contexto.
- Use ativamente o contexto: titulo, descricao, entrevista, spec, projeto.`)

  const cardLines: string[] = ['## Contexto do card']
  cardLines.push(`- Titulo: ${card.title}`)
  cardLines.push(`- Tipo: ${card.type} · Prioridade: ${card.priority}`)
  if (card.description?.trim()) {
    cardLines.push('')
    cardLines.push('### Descricao')
    cardLines.push(card.description.trim())
  }
  if (card.interview_notes?.trim()) {
    cardLines.push('')
    cardLines.push('### Notas da entrevista')
    cardLines.push(card.interview_notes.trim())
  }
  if (card.spec_content?.trim()) {
    cardLines.push('')
    cardLines.push(`### Spec (status: ${card.spec_status || 'rascunho'})`)
    const spec = card.spec_content.trim()
    cardLines.push(spec.length > 3000 ? spec.slice(0, 3000) + '\n…[truncada]' : spec)
  }
  parts.push(cardLines.join('\n'))

  if (project) {
    parts.push(`## Projeto vinculado
- Nome: ${project.name}
- Path: ${project.path}

Voce tem acesso ao codigo-fonte deste projeto via filesystem.`)
  }

  return parts.join('\n\n')
}

void sym
