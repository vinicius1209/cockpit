import type { AgentConfig, AgentMessage } from '@/entities/agent/types'
import { DAEMON_URL } from '@/shared/lib/constants'

interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (fullText: string) => void
  onError: (error: string) => void
  /** Optional: receives the daemon-side session id when persistence is active. */
  onSessionStart?: (sessionId: string) => void
}

// Optional persistence info passed to /chat/run so daemon writes a session row.
// Frontend uses session.id later for reconciliation (N3).
export interface RunAgentOptions {
  cardId?: string
  workspaceSlug?: string
  action?: 'spec' | 'implementation' | 'discovery' | 'chat'
}

export async function runAgent(
  config: AgentConfig,
  messages: AgentMessage[],
  _apiKey: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  projectPath?: string,
  options?: RunAgentOptions,
) {
  // Always route through daemon — API keys are stored server-side
  // If daemon has an API key for the provider → uses /chat/api (direct API, fast)
  // Otherwise → uses /chat/run (CLI agent fallback)
  const provider = config.provider

  if (provider && ['claude', 'openai', 'gemini'].includes(provider)) {
    return runViaApiProxy(config, messages, callbacks, signal, projectPath, options)
  }

  return runViaDaemon(config, messages, callbacks, signal, projectPath, options)
}

async function runViaApiProxy(
  config: AgentConfig,
  messages: AgentMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  projectPath?: string,
  options?: RunAgentOptions,
) {
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  try {
    const response = await fetch(`${DAEMON_URL}/chat/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.provider,
        model: config.model,
        systemPrompt: config.system_prompt,
        messages: chatMessages,
        maxTokens: config.max_tokens,
        temperature: config.temperature,
      }),
      signal,
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ error: response.statusText }))
      const errMsg = (errBody as { error?: string }).error || `API proxy error ${response.status}`
      // If API key not configured, fall back to CLI agent
      if (response.status === 400 && errMsg.includes('nao configurada')) {
        return runViaDaemon(config, messages, callbacks, signal, projectPath, options)
      }
      callbacks.onError(errMsg)
      return
    }

    await readDaemonSSE(response, callbacks)
  } catch (err) {
    if (signal?.aborted) {
      callbacks.onError('Cancelado')
      return
    }
    callbacks.onError(err instanceof Error ? err.message : 'Erro de conexao com daemon')
  }
}

async function runViaDaemon(
  config: AgentConfig,
  messages: AgentMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  projectPath?: string,
  options?: RunAgentOptions,
) {
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  try {
    const response = await fetch(`${DAEMON_URL}/chat/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: config.system_prompt,
        messages: chatMessages,
        model: config.model,
        projectPath,
        // Persistence hints — daemon ignores when missing
        cardId: options?.cardId,
        workspaceSlug: options?.workspaceSlug,
        action: options?.action,
      }),
      signal,
    })

    if (!response.ok) {
      const err = await response.text()
      callbacks.onError(`Daemon error: ${err}`)
      return
    }

    await readDaemonSSE(response, callbacks)
  } catch (err) {
    if (signal?.aborted) {
      callbacks.onError('Cancelado')
      return
    }
    callbacks.onError(err instanceof Error ? err.message : 'Erro de conexao com daemon')
  }
}

// Shared SSE reader — both /chat/run and /chat/api use the same format
async function readDaemonSSE(response: Response, callbacks: StreamCallbacks) {
  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError('No response body')
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

      try {
        const event = JSON.parse(data)
        if (event.type === 'start' && event.sessionId && callbacks.onSessionStart) {
          callbacks.onSessionStart(event.sessionId as string)
        } else if (event.type === 'chunk' && event.text) {
          fullText += event.text
          callbacks.onToken(event.text)
        } else if (event.type === 'done') {
          if (event.fullText) fullText = event.fullText
        } else if (event.type === 'error') {
          callbacks.onError(event.message || 'Erro do daemon')
          return
        }
      } catch {
        // skip malformed
      }
    }
  }

  callbacks.onComplete(fullText.trim())
}
