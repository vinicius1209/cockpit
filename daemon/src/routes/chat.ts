import { jsonResponse } from '../http'
import { executeAgentWithCallbacks, detectInstalledAgents } from '../executor/agent-executor'
import { getSecret } from '../persistence/secrets-store'
import { createAgentSession, appendChunk, finishAgentSession, type SessionAction } from '../tasks/session-manager'
import { publish as publishSession } from '../tasks/session-broker'

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
  // Optional N2 fields — when present, daemon persists session for reconciliation
  cardId?: string
  workspaceSlug?: string
  action?: SessionAction
}

interface ApiProxyRequest {
  provider: 'claude' | 'openai' | 'gemini'
  model: string
  systemPrompt: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
}

function buildPrompt(systemPrompt: string, messages: ChatMessage[]): string {
  const parts: string[] = []

  if (systemPrompt) {
    parts.push(systemPrompt)
    parts.push('')
  }

  if (messages.length > 1) {
    parts.push('Histórico da conversa:')
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
    parts.push('Responda a última mensagem do usuario.')
  }

  return parts.join('\n')
}

export async function handleChatRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /chat/run — conversational AI via CLI agent, SSE streaming
  if (path === '/chat/run' && req.method === 'POST') {
    const body = await req.json() as ChatRequest

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonResponse({ error: 'Missing or invalid "messages"' }, 400)
    }

    // Pick agent: use specified or find first available
    const agents = await detectInstalledAgents()
    const agentName = body.agent || agents[0]?.name
    const agentDef = agents.find((a) => a.name === agentName)

    if (!agentDef) {
      return jsonResponse({ error: 'Nenhum CLI agent encontrado. Instale claude-code, opencode ou gemini-cli.' }, 400)
    }

    const prompt = buildPrompt(body.systemPrompt || '', body.messages)

    // Persistencia opcional — se cliente mandou cardId+action, criamos session
    // para que o frontend possa reconciliar após reload (N2/N3).
    const persist = body.cardId && body.workspaceSlug && body.action
    const session = persist
      ? await createAgentSession({
          workspaceSlug: body.workspaceSlug!,
          cardId: body.cardId!,
          action: body.action!,
          agent: agentName!,
          model: body.model || null,
        })
      : null

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        let closed = false

        function safeEnqueue(text: string) {
          if (closed) return
          try { controller.enqueue(encoder.encode(text)) } catch { closed = true }
        }
        function send(data: Record<string, unknown>) {
          safeEnqueue(`data: ${JSON.stringify(data)}\n\n`)
        }

        // Anti-buffering: flush imediato + heartbeat
        safeEnqueue(': stream-open\n\n')
        const heartbeat = setInterval(() => safeEnqueue(': hb\n\n'), 1500)

        try {
          send({ type: 'start', agent: agentName, sessionId: session?.id })

          const result = await executeAgentWithCallbacks(
            {
              agent: agentName!,
              prompt,
              projectPath: body.projectPath,
              model: body.model,
            },
            (chunk) => {
              send({ type: 'chunk', text: chunk })
              if (session) {
                appendChunk(session.id, chunk).catch(() => {})
                // Live publish para subscribers SSE em outras abas/depois-do-reload
                publishSession(session.id, { type: 'chunk', text: chunk })
              }
            },
          )

          if (session) {
            await finishAgentSession(session.id, {
              phase: 'done',
              exitCode: result.exitCode,
            })
            publishSession(session.id, { type: 'done', exitCode: result.exitCode })
          }
          send({ type: 'done', exitCode: result.exitCode, fullText: result.output, sessionId: session?.id })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido'
          if (session) {
            await finishAgentSession(session.id, { phase: 'error', error: msg }).catch(() => {})
            publishSession(session.id, { type: 'error', error: msg })
          }
          send({ type: 'error', message: msg, sessionId: session?.id })
        } finally {
          clearInterval(heartbeat)
          closed = true
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // POST /chat/api — proxy direct API calls (keys stay server-side)
  if (path === '/chat/api' && req.method === 'POST') {
    const body = await req.json() as ApiProxyRequest

    if (!body.provider || !body.messages || body.messages.length === 0) {
      return jsonResponse({ error: 'Missing "provider" or "messages"' }, 400)
    }

    const apiKey = getSecret(body.provider)
    if (!apiKey) {
      return jsonResponse({ error: `API key para "${body.provider}" não configurada no daemon. Use Settings > API Keys.` }, 400)
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          send({ type: 'start', provider: body.provider })

          const apiMessages = body.messages.filter((m) => m.role !== 'system')

          let response: Response

          if (body.provider === 'claude') {
            response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: body.model,
                max_tokens: body.maxTokens || 4096,
                temperature: body.temperature ?? 0.7,
                system: body.systemPrompt,
                messages: apiMessages.map((m) => ({ role: m.role, content: m.content })),
                stream: true,
              }),
            })
          } else if (body.provider === 'openai') {
            response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: body.model,
                max_tokens: body.maxTokens || 4096,
                temperature: body.temperature ?? 0.7,
                messages: [
                  { role: 'system', content: body.systemPrompt },
                  ...apiMessages.map((m) => ({ role: m.role, content: m.content })),
                ],
                stream: true,
              }),
            })
          } else if (body.provider === 'gemini') {
            const geminiModel = body.model || 'gemini-2.0-flash'
            response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?key=${apiKey}&alt=sse`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: apiMessages.map((m) => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }],
                  })),
                  systemInstruction: body.systemPrompt ? { parts: [{ text: body.systemPrompt }] } : undefined,
                  generationConfig: {
                    temperature: body.temperature ?? 0.7,
                    maxOutputTokens: body.maxTokens || 4096,
                  },
                }),
              },
            )
          } else {
            send({ type: 'error', message: `Provider "${body.provider}" não suportado` })
            controller.close()
            return
          }

          if (!response.ok) {
            const errText = await response.text()
            send({ type: 'error', message: `${body.provider} API error ${response.status}: ${errText.slice(0, 500)}` })
            controller.close()
            return
          }

          // Stream the response using same SSE format as /chat/run
          const reader = response.body?.getReader()
          if (!reader) {
            send({ type: 'error', message: 'No response body from API' })
            controller.close()
            return
          }

          const decoder = new TextDecoder()
          let fullText = ''
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue

              try {
                const event = JSON.parse(data)
                let text: string | null = null

                if (body.provider === 'claude') {
                  if (event.type === 'content_block_delta' && event.delta?.text) {
                    text = event.delta.text
                  }
                } else if (body.provider === 'openai') {
                  text = event.choices?.[0]?.delta?.content || null
                } else if (body.provider === 'gemini') {
                  text = event.candidates?.[0]?.content?.parts?.[0]?.text || null
                }

                if (text) {
                  fullText += text
                  send({ type: 'chunk', text })
                }
              } catch {
                // skip malformed JSON
              }
            }
          }

          send({ type: 'done', fullText })
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
      },
    })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
