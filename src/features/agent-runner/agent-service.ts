import type { AgentConfig, AgentMessage } from '@/entities/agent/types'

interface StreamCallbacks {
  onToken: (token: string) => void
  onComplete: (fullText: string) => void
  onError: (error: string) => void
}

export async function runAgent(
  config: AgentConfig,
  messages: AgentMessage[],
  apiKey: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const provider = config.provider

  if (provider === 'claude') {
    return runClaude(config, messages, apiKey, callbacks, signal)
  } else if (provider === 'openai') {
    return runOpenAI(config, messages, apiKey, callbacks, signal)
  } else if (provider === 'gemini') {
    return runGemini(config, messages, apiKey, callbacks, signal)
  } else {
    callbacks.onError(`Provider "${provider}" nao suportado ainda`)
  }
}

async function runClaude(
  config: AgentConfig,
  messages: AgentMessage[],
  apiKey: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const apiMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        system: config.system_prompt,
        messages: apiMessages,
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const err = await response.text()
      callbacks.onError(`Claude API error ${response.status}: ${err}`)
      return
    }

    await readSSEStream(response, callbacks, (event) => {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        return event.delta.text as string
      }
      return null
    })
  } catch (err) {
    handleStreamError(err, signal, callbacks)
  }
}

async function runOpenAI(
  config: AgentConfig,
  messages: AgentMessage[],
  apiKey: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const apiMessages = [
    { role: 'system' as const, content: config.system_prompt },
    ...messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        messages: apiMessages,
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const err = await response.text()
      callbacks.onError(`OpenAI API error ${response.status}: ${err}`)
      return
    }

    await readSSEStream(response, callbacks, (event) => {
      return (event.choices?.[0]?.delta?.content as string) || null
    })
  } catch (err) {
    handleStreamError(err, signal, callbacks)
  }
}

async function runGemini(
  config: AgentConfig,
  messages: AgentMessage[],
  apiKey: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const model = config.model || 'gemini-2.0-flash'

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: config.system_prompt ? { parts: [{ text: config.system_prompt }] } : undefined,
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.max_tokens,
          },
        }),
        signal,
      },
    )

    if (!response.ok) {
      const err = await response.text()
      callbacks.onError(`Gemini API error ${response.status}: ${err}`)
      return
    }

    await readSSEStream(response, callbacks, (event) => {
      return (event.candidates?.[0]?.content?.parts?.[0]?.text as string) || null
    })
  } catch (err) {
    handleStreamError(err, signal, callbacks)
  }
}

// Shared SSE stream reader
async function readSSEStream(
  response: Response,
  callbacks: StreamCallbacks,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractText: (event: any) => string | null,
) {
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
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data)
        const text = extractText(event)
        if (text) {
          fullText += text
          callbacks.onToken(text)
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  callbacks.onComplete(fullText)
}

function handleStreamError(err: unknown, signal: AbortSignal | undefined, callbacks: StreamCallbacks) {
  if (signal?.aborted) {
    callbacks.onError('Cancelado')
    return
  }
  callbacks.onError(err instanceof Error ? err.message : 'Erro desconhecido')
}
