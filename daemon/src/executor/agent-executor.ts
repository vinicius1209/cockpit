export interface InstalledAgent {
  name: string
  command: string
  path: string
  version: string | null
  headlessFlag: string
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

const KNOWN_AGENTS: { name: string; command: string; headlessFlag: string; versionFlag: string }[] = [
  { name: 'claude-code', command: 'claude', headlessFlag: '-p', versionFlag: '--version' },
  { name: 'opencode', command: 'opencode', headlessFlag: '--prompt', versionFlag: '--version' },
  { name: 'gemini-cli', command: 'gemini', headlessFlag: '-p', versionFlag: '--version' },
  { name: 'aider', command: 'aider', headlessFlag: '--message', versionFlag: '--version' },
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

  const args: string[] = [agentDef.headlessFlag, request.prompt]

  // Claude Code specific flags
  if (agentDef.name === 'claude-code') {
    args.push('--output-format', 'text')
    if (request.model) {
      args.push('--model', request.model)
    }
  }

  const startTime = Date.now()

  try {
    const proc = Bun.spawn([agentDef.command, ...args], {
      cwd: request.projectPath || undefined,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    const duration = Date.now() - startTime

    return {
      agent: request.agent,
      output: stdout || stderr,
      exitCode,
      duration,
    }
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

  const args: string[] = [agentDef.headlessFlag, request.prompt]
  if (agentDef.name === 'claude-code') {
    args.push('--output-format', 'text')
    if (request.model) args.push('--model', request.model)
  }

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
