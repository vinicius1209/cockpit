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

interface KnownAgent {
  name: string
  command: string
  headlessFlag: string
  versionFlag: string
  modelFlag: string
  models: AgentModel[]
  defaultModel: string | null
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
    buildArgs: (flag, prompt, model) => {
      const args = [flag, prompt, '--output-format', 'text']
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

export async function detectInstalledAgents(): Promise<InstalledAgent[]> {
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

  return agents
}

export async function executeAgent(request: AgentExecRequest): Promise<AgentExecResult> {
  const agentDef = KNOWN_AGENTS.find((a) => a.name === request.agent)
  if (!agentDef) {
    return { agent: request.agent, output: `Agent "${request.agent}" not found`, exitCode: 1, duration: 0 }
  }

  const usePipe = request.prompt.length > 4000
  const args = usePipe
    ? agentDef.buildArgs(agentDef.headlessFlag, '-', request.model)
    : agentDef.buildArgs(agentDef.headlessFlag, request.prompt, request.model)
  const startTime = Date.now()

  try {
    const proc = Bun.spawn([agentDef.command, ...args], {
      cwd: request.projectPath || undefined,
      stdin: usePipe ? 'pipe' : undefined,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    })

    if (usePipe && proc.stdin) {
      const writer = proc.stdin.getWriter()
      await writer.write(new TextEncoder().encode(request.prompt))
      await writer.close()
    }

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    const duration = Date.now() - startTime

    return { agent: request.agent, output: stdout || stderr, exitCode, duration }
  } catch (err) {
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
): Promise<AgentExecResult> {
  const agentDef = KNOWN_AGENTS.find((a) => a.name === request.agent)
  if (!agentDef) {
    return { agent: request.agent, output: `Agent "${request.agent}" not found`, exitCode: 1, duration: 0 }
  }

  // For large prompts, use stdin instead of CLI argument to avoid OS limits
  const usePipe = request.prompt.length > 4000
  const args = usePipe
    ? agentDef.buildArgs(agentDef.headlessFlag, '-', request.model)
    : agentDef.buildArgs(agentDef.headlessFlag, request.prompt, request.model)
  const startTime = Date.now()

  try {
    const proc = Bun.spawn([agentDef.command, ...args], {
      cwd: request.projectPath || undefined,
      stdin: usePipe ? 'pipe' : undefined,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    })

    // Write prompt to stdin if piping
    if (usePipe && proc.stdin) {
      const writer = proc.stdin.getWriter()
      await writer.write(new TextEncoder().encode(request.prompt))
      await writer.close()
    }

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let fullOutput = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      fullOutput += text
      const lines = text.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        onChunk(line.trim())
      }
    }

    const exitCode = await proc.exited
    const duration = Date.now() - startTime

    return { agent: request.agent, output: fullOutput, exitCode, duration }
  } catch (err) {
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

  const args = agentDef.buildArgs(agentDef.headlessFlag, request.prompt, request.model)

  let proc: ReturnType<typeof Bun.spawn> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      try {
        proc = Bun.spawn([agentDef.command, ...args], {
          cwd: request.projectPath || undefined,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, NO_COLOR: '1' },
        })

        const reader = proc.stdout.getReader()

        controller.enqueue(`data: ${JSON.stringify({ type: 'start', agent: request.agent })}\n\n`)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = new TextDecoder().decode(value)
          controller.enqueue(`data: ${JSON.stringify({ type: 'chunk', data: text })}\n\n`)
        }

        const exitCode = await proc.exited
        controller.enqueue(`data: ${JSON.stringify({ type: 'done', exitCode })}\n\n`)
      } catch (err) {
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
