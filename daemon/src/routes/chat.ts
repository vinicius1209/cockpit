import { jsonResponse } from '../index'
import { executeAgentWithCallbacks, detectInstalledAgents } from '../executor/agent-executor'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequest {
  agent?: string
  model?: string
  systemPrompt: string
  messages: ChatMessage[]
  projectPath?: string
}

function buildPrompt(systemPrompt: string, messages: ChatMessage[]): string {
  const parts: string[] = []

  if (systemPrompt) {
    parts.push(systemPrompt)
    parts.push('')
  }

  if (messages.length > 1) {
    parts.push('Historico da conversa:')
    for (const msg of messages.slice(0, -1)) {
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      parts.push(`${role}: ${msg.content}`)
    }
    parts.push('')
  }

  const lastMsg = messages[messages.length - 1]
  if (lastMsg) {
    parts.push(`User: ${lastMsg.content}`)
    parts.push('')
    parts.push('Responda a ultima mensagem do usuario.')
  }

  return parts.join('\n')
}

export async function handleChatRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /chat/run — conversational AI via CLI agent, SSE streaming
  if (path === '/chat/run' && req.method === 'POST') {
    const body = await req.json() as ChatRequest

    if (!body.messages || body.messages.length === 0) {
      return jsonResponse({ error: 'Missing "messages"' }, 400)
    }

    // Pick agent: use specified or find first available
    const agents = await detectInstalledAgents()
    const agentName = body.agent || agents[0]?.name
    const agentDef = agents.find((a) => a.name === agentName)

    if (!agentDef) {
      return jsonResponse({ error: 'Nenhum CLI agent encontrado. Instale claude-code, opencode ou gemini-cli.' }, 400)
    }

    const prompt = buildPrompt(body.systemPrompt || '', body.messages)

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          send({ type: 'start', agent: agentName })

          const result = await executeAgentWithCallbacks(
            {
              agent: agentName,
              prompt,
              projectPath: body.projectPath,
              model: body.model,
            },
            (chunk) => {
              send({ type: 'chunk', text: chunk })
            },
          )

          send({ type: 'done', exitCode: result.exitCode, fullText: result.output })
        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
