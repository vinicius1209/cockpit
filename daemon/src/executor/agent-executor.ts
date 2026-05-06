const AGENT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} excedeu ${ms / 1000}s`)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

export interface AgentModel {
  id: string
  label: string
  cost: 'low' | 'medium' | 'high'
}

export interface InstalledAgent {
  name: string
  command: string
  path: string
  version: string | null
  headlessFlag: string
  models: AgentModel[]
  defaultModel: string | null
}

export interface AgentExecRequest {
  agent: string
  prompt: string
  projectPath?: string
  model?: string
}

export interface AgentExecResult {
  agent: string
  output: string
  exitCode: number
  duration: number
}

type StreamFormat = 'plain-lines' | 'claude-stream-json'

interface KnownAgent {
  name: string
  command: string
  headlessFlag: string
  versionFlag: string
  modelFlag: string
  models: AgentModel[]
  defaultModel: string | null
  streamFormat?: StreamFormat
  buildArgs: (headlessFlag: string, prompt: string, model?: string) => string[]
}

const KNOWN_AGENTS: KnownAgent[] = [
  {
    name: 'claude-code',
    command: 'claude',
    headlessFlag: '-p',
    versionFlag: '--version',
    modelFlag: '--model',
    models: [
      { id: 'haiku', label: 'Haiku (rapido, barato)', cost: 'low' },
      { id: 'sonnet', label: 'Sonnet (equilibrado)', cost: 'medium' },
      { id: 'opus', label: 'Opus (profundo, caro)', cost: 'high' },
    ],
    defaultModel: 'sonnet',
    streamFormat: 'claude-stream-json',
    buildArgs: (flag, prompt, model) => {
      // bypassPermissions: necessario em modo -p sem TTY, senao Read/Edit
      // sao bloqueados silenciosamente e o agent responde "nao tenho permissao".
      // stream-json + include-partial-messages: streaming real (text deltas em
      // tempo real). Sem isso o claude-code bufferiza ate o fim e o frontend
      // fica 30s+ vendo "0 chunks".
      const args = [
        flag, prompt,
        '--output-format', 'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
      ]
      if (model) args.push('--model', model)
      return args
    },
  },
  {
    name: 'opencode',
    command: 'opencode',
    headlessFlag: 'run',
    versionFlag: '--version',
    modelFlag: '--model',
    models: [
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (rapido)', cost: 'low' },
      { id: 'openai/gpt-5-nano', label: 'GPT-5 Nano (leve)', cost: 'low' },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (equilibrado)', cost: 'medium' },
      { id: 'openai/gpt-5.5', label: 'GPT-5.5 (profundo)', cost: 'high' },
      { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (mais recente)', cost: 'high' },
    ],
    defaultModel: 'google/gemini-2.5-flash',
    buildArgs: (flag, prompt, model) => {
      const args = [flag, prompt]
      if (model) args.push('--model', model)
      args.push('--format', 'default')
      return args
    },
  },
  {
    name: 'gemini-cli',
    command: 'gemini',
    headlessFlag: '-p',
    versionFlag: '--version',
    modelFlag: '--model',
    models: [
      { id: 'gemini-2.5-flash', label: 'Flash 2.5 (rapido)', cost: 'low' },
      { id: 'gemini-2.5-pro', label: 'Pro 2.5 (equilibrado)', cost: 'medium' },
      { id: 'gemini-3.1-pro-preview', label: 'Pro 3.1 (mais recente)', cost: 'high' },
    ],
    defaultModel: 'gemini-2.5-flash',
    buildArgs: (flag, prompt, model) => {
      const args = [flag, prompt, '--output-format', 'text']
      if (model) args.push('--model', model)
      return args
    },
  },
  {
    name: 'aider',
    command: 'aider',
    headlessFlag: '--message',
    versionFlag: '--version',
    modelFlag: '--model',
    models: [],
    defaultModel: null,
    buildArgs: (flag, prompt, model) => {
      const args = [flag, prompt]
      if (model) args.push('--model', model)
      return args
    },
  },
]

let cachedAgents: InstalledAgent[] | null = null
let cachedAt = 0
const CACHE_TTL = 60_000 // 60 seconds

export async function detectInstalledAgents(): Promise<InstalledAgent[]> {
  if (cachedAgents && Date.now() - cachedAt < CACHE_TTL) {
    return cachedAgents
  }

  const agents: InstalledAgent[] = []

  for (const agent of KNOWN_AGENTS) {
    try {
      const whichProc = Bun.spawn(['which', agent.command], { stdout: 'pipe', stderr: 'pipe' })
      const whichOut = await new Response(whichProc.stdout).text()
      const exitCode = await whichProc.exited
      if (exitCode !== 0) continue

      const agentPath = whichOut.trim()

      let version: string | null = null
      try {
        const vProc = Bun.spawn([agent.command, agent.versionFlag], { stdout: 'pipe', stderr: 'pipe' })
        const vOut = await new Response(vProc.stdout).text()
        await vProc.exited
        version = vOut.trim().split('\n')[0] || null
      } catch {
        // version detection is optional
      }

      agents.push({
        name: agent.name,
        command: agent.command,
        path: agentPath,
        version,
        headlessFlag: agent.headlessFlag,
        models: agent.models,
        defaultModel: agent.defaultModel,
      })
    } catch {
      // agent not found
    }
  }

  cachedAgents = agents
  cachedAt = Date.now()
  return agents
}

// Normalize API-style model IDs (e.g. "claude-sonnet-4-6") to CLI tier names
// (haiku/sonnet/opus). Keeps full IDs unchanged for executors that accept them.
function normalizeModelForCli(agentName: string, model?: string): string | undefined {
  if (!model) return undefined
  if (agentName === 'claude-code') {
    const lower = model.toLowerCase()
    if (lower.includes('haiku')) return 'haiku'
    if (lower.includes('sonnet')) return 'sonnet'
    if (lower.includes('opus')) return 'opus'
  }
  return model
}

// Bun's proc.stdin (when spawned with stdin: 'pipe') is a FileSink — it has
// write/end/flush methods, NOT WritableStream getWriter(). The previous
// implementation called getWriter() which threw silently and was caught into
// a generic "Failed to write prompt to stdin" error.
async function writePromptToStdin(stdin: unknown, prompt: string): Promise<void> {
  const sink = stdin as { write?: (s: string) => unknown; end?: () => unknown | Promise<unknown> }
  if (typeof sink.write === 'function' && typeof sink.end === 'function') {
    sink.write(prompt)
    await sink.end()
    return
  }
  // Fallback for environments where stdin behaves like a WritableStream
  const ws = stdin as WritableStream<Uint8Array>
  if (typeof ws.getWriter === 'function') {
    const writer = ws.getWriter()
    await writer.write(new TextEncoder().encode(prompt))
    await writer.close()
    return
  }
  throw new Error('Process stdin has no recognized write API (FileSink/WritableStream)')
}

// Parser para o stream-json do claude-code. Cada linha eh um envelope JSON;
// extrai text deltas em tempo real.
//
// Formatos relevantes (verbose + include-partial-messages):
//   { type: 'system',    subtype: 'init', ... }                 → ignorar (header)
//   { type: 'assistant', message: { content: [{type:'text', text:'...'}] } } → texto completo de uma assistant turn
//   { type: 'stream_event', event: { type:'content_block_delta', delta:{type:'text_delta', text:'...'} } } → DELTA de texto
//   { type: 'tool_use',  ... }                                  → action visivel
//   { type: 'result',    result: '...', is_error: false }       → final
//
// Funcao de incremento devolve o texto novo (delta). Se for envelope sem texto,
// devolve null. Se quiser sinais semanticos (tool_use), retorna prefixados.
const DEBUG_STREAM = process.env.COCKPIT_DEBUG_STREAM === '1'

// Stateful parser — precisa lembrar se ja vimos stream_event nesta sessao
// para suprimir o `assistant` final (que duplica o texto agregado dos deltas).
// Tambem acumula input_json_deltas dos tool_use blocks para mostrar args reais.
export interface ClaudeStreamParserState {
  sawStreamEvent: boolean
  // Map: index do content_block → tool_use info acumulado
  pendingTools: Map<number, { name: string; inputBuffer: string }>
}

export function createClaudeStreamParserState(): ClaudeStreamParserState {
  return { sawStreamEvent: false, pendingTools: new Map() }
}

function parseClaudeStreamLine(
  line: string,
  state: ClaudeStreamParserState,
): { text?: string; meta?: string } | null {
  let evt: Record<string, unknown>
  try {
    evt = JSON.parse(line)
  } catch {
    if (DEBUG_STREAM && line.trim()) console.log('[claude-stream] non-json:', JSON.stringify(line.slice(0, 200)))
    return null
  }

  if (DEBUG_STREAM) {
    const summary = `${evt.type}${evt.subtype ? '/' + evt.subtype : ''}${(evt.event as Record<string, unknown>)?.type ? ':' + (evt.event as Record<string, unknown>).type : ''}`
    console.log('[claude-stream]', summary)
  }

  const type = evt.type as string | undefined

  // Stream event — true streaming (deltas)
  if (type === 'stream_event') {
    const event = evt.event as Record<string, unknown> | undefined
    const eventType = event?.type as string | undefined
    const blockIdx = event?.index as number | undefined

    // Tool use start — apenas registra; input vem em deltas posteriores
    if (eventType === 'content_block_start') {
      const block = event?.content_block as Record<string, unknown> | undefined
      if (block?.type === 'tool_use' && typeof block.name === 'string') {
        state.sawStreamEvent = true
        if (typeof blockIdx === 'number') {
          state.pendingTools.set(blockIdx, { name: block.name as string, inputBuffer: '' })
        }
        // Nao emitimos meta aqui — esperamos o stop com input completo
        return null
      }
    }

    // input_json_delta acumula partial JSON do input do tool
    if (eventType === 'content_block_delta') {
      const delta = event?.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        state.sawStreamEvent = true
        return { text: delta.text }
      }
      if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        if (typeof blockIdx === 'number' && state.pendingTools.has(blockIdx)) {
          const t = state.pendingTools.get(blockIdx)!
          t.inputBuffer += delta.partial_json
        }
        return null
      }
    }

    // content_block_stop — emitimos o tool com input completo
    if (eventType === 'content_block_stop') {
      if (typeof blockIdx === 'number' && state.pendingTools.has(blockIdx)) {
        const t = state.pendingTools.get(blockIdx)!
        state.pendingTools.delete(blockIdx)
        const summary = summarizeToolInput(t.name, t.inputBuffer)
        return { meta: summary ? `▶ ${t.name} ${summary}` : `▶ ${t.name}` }
      }
    }

    return null
  }

  // Assistant turn — APENAS como fallback quando partial messages nao funcionou.
  // Se ja vimos stream_event, ignoramos para evitar duplicacao do texto agregado.
  if (type === 'assistant') {
    if (state.sawStreamEvent) return null

    const msg = evt.message as Record<string, unknown> | undefined
    const content = msg?.content as Array<Record<string, unknown>> | undefined
    if (content) {
      const text = content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('')
      if (text) return { text }
    }
    return null
  }

  // System/init/result messages — ignorar silenciosamente
  return null
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Extrai a info mais relevante do input do tool para exibir ao usuario.
// - Read/Write/Edit: file_path
// - Bash: command (truncado)
// - Glob/Grep: pattern
// - WebFetch: url
// - TodoWrite: count de todos
// - Outros: vazio (mostra so o nome do tool)
function summarizeToolInput(toolName: string, partialJson: string): string {
  if (!partialJson.trim() || partialJson.trim() === '{}') return ''
  let input: Record<string, unknown>
  try {
    input = JSON.parse(partialJson)
  } catch {
    // Partial JSON malformed — possivel se stream foi cortado.
    // Tenta extrair file_path/command via regex como fallback
    const m = partialJson.match(/"(?:file_path|path|command|pattern|url)"\s*:\s*"([^"]+)"/)
    return m ? m[1] : ''
  }

  if (typeof input.file_path === 'string') return truncate(input.file_path.replace(/^\/Users\/[^/]+\//, '~/'), 70)
  if (typeof input.path === 'string') return truncate(input.path.replace(/^\/Users\/[^/]+\//, '~/'), 70)
  if (typeof input.command === 'string') return truncate(input.command, 70)
  if (typeof input.pattern === 'string') return truncate(input.pattern, 70)
  if (typeof input.url === 'string') return truncate(input.url, 70)
  if (toolName === 'TodoWrite' && Array.isArray(input.todos)) return `${input.todos.length} todo(s)`

  // Fallback: primeiro field string nao-vazio
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v) return truncate(`${k}=${v}`, 70)
  }
  return ''
}

function validateModel(agentDef: KnownAgent, model?: string): string | null {
  if (!model) return null
  if (agentDef.models.length === 0) return null // agent has no model list (e.g. aider)
  if (agentDef.models.some((m) => m.id === model)) return null
  return `Model "${model}" not available for ${agentDef.name}. Valid: ${agentDef.models.map((m) => m.id).join(', ')}`
}

export async function executeAgent(request: AgentExecRequest): Promise<AgentExecResult> {
  const agentDef = KNOWN_AGENTS.find((a) => a.name === request.agent)
  if (!agentDef) {
    return { agent: request.agent, output: `Agent "${request.agent}" not found`, exitCode: 1, duration: 0 }
  }
  const model = normalizeModelForCli(agentDef.name, request.model)
  const modelErr = validateModel(agentDef, model)
  if (modelErr) {
    return { agent: request.agent, output: modelErr, exitCode: 1, duration: 0 }
  }

  const usePipe = request.prompt.length > 4000
  const args = usePipe
    ? agentDef.buildArgs(agentDef.headlessFlag, '-', model)
    : agentDef.buildArgs(agentDef.headlessFlag, request.prompt, model)
  const startTime = Date.now()
  let proc: ReturnType<typeof Bun.spawn> | null = null

  try {
    proc = Bun.spawn([agentDef.command, ...args], {
      cwd: request.projectPath || undefined,
      stdin: usePipe ? 'pipe' : undefined,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    })

    if (usePipe && proc.stdin) {
      try {
        await writePromptToStdin(proc.stdin, request.prompt)
      } catch (err) {
        proc.kill()
        const msg = err instanceof Error ? err.message : String(err)
        return { agent: request.agent, output: `Failed to write prompt to stdin: ${msg}`, exitCode: 1, duration: Date.now() - startTime }
      }
    }

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await withTimeout(proc.exited, AGENT_TIMEOUT_MS, request.agent)
    const duration = Date.now() - startTime

    return { agent: request.agent, output: stdout || stderr, exitCode, duration }
  } catch (err) {
    proc?.kill()
    return {
      agent: request.agent,
      output: err instanceof Error ? err.message : 'Unknown error',
      exitCode: 1,
      duration: Date.now() - startTime,
    }
  }
}

export async function executeAgentWithCallbacks(
  request: AgentExecRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<AgentExecResult> {
  const agentDef = KNOWN_AGENTS.find((a) => a.name === request.agent)
  if (!agentDef) {
    return { agent: request.agent, output: `Agent "${request.agent}" not found`, exitCode: 1, duration: 0 }
  }
  const model = normalizeModelForCli(agentDef.name, request.model)
  const modelErr = validateModel(agentDef, model)
  if (modelErr) {
    return { agent: request.agent, output: modelErr, exitCode: 1, duration: 0 }
  }

  const usePipe = request.prompt.length > 4000
  const args = usePipe
    ? agentDef.buildArgs(agentDef.headlessFlag, '-', model)
    : agentDef.buildArgs(agentDef.headlessFlag, request.prompt, model)
  const startTime = Date.now()
  let proc: ReturnType<typeof Bun.spawn> | null = null

  try {
    proc = Bun.spawn([agentDef.command, ...args], {
      cwd: request.projectPath || undefined,
      stdin: usePipe ? 'pipe' : undefined,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    })

    // F-MCP-T3 — abort externo (via cockpit_abort_session): mata o processo
    // do agent. O codigo abaixo trata exitCode=143 (SIGTERM) como abort sinal.
    const onAbort = () => {
      try { proc?.kill() } catch { /* ignore */ }
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    if (usePipe && proc.stdin) {
      try {
        await writePromptToStdin(proc.stdin, request.prompt)
      } catch (err) {
        proc.kill()
        const msg = err instanceof Error ? err.message : String(err)
        if (signal) signal.removeEventListener('abort', onAbort)
        return { agent: request.agent, output: `Failed to write prompt to stdin: ${msg}`, exitCode: 1, duration: Date.now() - startTime }
      }
    }

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    const streamFormat: StreamFormat = agentDef.streamFormat || 'plain-lines'
    const parserState = createClaudeStreamParserState()
    let fullText = ''      // texto extraido (apenas content, nao envelopes JSON)
    let lineBuffer = ''    // acumula bytes ate \n para parser por linha

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      lineBuffer += decoder.decode(value, { stream: true })

      // Split por \n, mantem o ultimo (incompleto) no buffer
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue

        if (streamFormat === 'claude-stream-json') {
          const parsed = parseClaudeStreamLine(line, parserState)
          if (parsed?.text) {
            fullText += parsed.text
            onChunk(parsed.text)
          } else if (parsed?.meta) {
            onChunk(parsed.meta)
          }
        } else {
          fullText += line + '\n'
          onChunk(line)
        }
      }
    }

    // Processa qualquer linha residual no buffer
    if (lineBuffer.trim()) {
      if (streamFormat === 'claude-stream-json') {
        const parsed = parseClaudeStreamLine(lineBuffer.trim(), parserState)
        if (parsed?.text) { fullText += parsed.text; onChunk(parsed.text) }
        else if (parsed?.meta) { onChunk(parsed.meta) }
      } else {
        fullText += lineBuffer
        onChunk(lineBuffer.trim())
      }
    }

    const exitCode = await withTimeout(proc.exited, AGENT_TIMEOUT_MS, request.agent)
    const duration = Date.now() - startTime

    return { agent: request.agent, output: fullText, exitCode, duration }
  } catch (err) {
    proc?.kill()
    return {
      agent: request.agent,
      output: err instanceof Error ? err.message : 'Unknown error',
      exitCode: 1,
      duration: Date.now() - startTime,
    }
  }
}

export function executeAgentStreaming(request: AgentExecRequest): {
  stream: ReadableStream
  abort: () => void
} {
  const agentDef = KNOWN_AGENTS.find((a) => a.name === request.agent)
  if (!agentDef) {
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(`data: ${JSON.stringify({ type: 'error', data: `Agent "${request.agent}" not found` })}\n\n`)
          controller.close()
        },
      }),
      abort: () => {},
    }
  }

  const model = normalizeModelForCli(agentDef.name, request.model)
  const usePipe = request.prompt.length > 4000
  const args = usePipe
    ? agentDef.buildArgs(agentDef.headlessFlag, '-', model)
    : agentDef.buildArgs(agentDef.headlessFlag, request.prompt, model)

  let proc: ReturnType<typeof Bun.spawn> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      try {
        proc = Bun.spawn([agentDef.command, ...args], {
          cwd: request.projectPath || undefined,
          stdin: usePipe ? 'pipe' : undefined,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, NO_COLOR: '1' },
        })

        if (usePipe && proc.stdin) {
          await writePromptToStdin(proc.stdin, request.prompt)
        }

        const reader = proc.stdout.getReader()

        controller.enqueue(`data: ${JSON.stringify({ type: 'start', agent: request.agent })}\n\n`)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = new TextDecoder().decode(value)
          controller.enqueue(`data: ${JSON.stringify({ type: 'chunk', data: text })}\n\n`)
        }

        const exitCode = await withTimeout(proc.exited, AGENT_TIMEOUT_MS, request.agent)
        controller.enqueue(`data: ${JSON.stringify({ type: 'done', exitCode })}\n\n`)
      } catch (err) {
        proc?.kill()
        controller.enqueue(`data: ${JSON.stringify({ type: 'error', data: err instanceof Error ? err.message : 'Unknown' })}\n\n`)
      } finally {
        controller.close()
      }
    },
  })

  return {
    stream,
    abort: () => proc?.kill(),
  }
}
