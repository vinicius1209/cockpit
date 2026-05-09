import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { table } from '../ui/table'
import { api, rawFetch } from '../api/client'

interface InstalledAgent {
  name: string
  command: string
  path: string
  version: string | null
  models: Array<{ id: string; label: string; cost: string }>
  defaultModel: string | null
}

export async function agentList(asJson = false): Promise<void> {
  const agents = await api.getAvailableAgents()
  if (asJson) {
    console.log(JSON.stringify(agents, null, 2))
    return
  }

  console.log(divider('CLI AGENTS', 'gray'))
  console.log()
  if (agents.length === 0) {
    console.log(c.amber('  ⚠ nenhum CLI agent instalado'))
    console.log(c.dim('  instale: claude-code, opencode, gemini-cli ou aider'))
    return
  }

  const rows = agents.map((a) => ({
    name: c.bold(a.name),
    version: a.version ? c.dim(a.version.split(' ')[0]) : c.dim('—'),
    path: c.dim(a.path.replace(/^\/Users\/[^/]+\//, '~/')),
    models: a.models.length > 0 ? c.dim(a.models.map((m) => m.id).join(', ')) : c.dim('—'),
    default: c.bold(a.defaultModel || '—'),
  }))

  console.log(table(rows, [
    { key: 'name', label: 'name' },
    { key: 'version', label: 'version' },
    { key: 'default', label: 'default' },
    { key: 'models', label: 'models' },
    { key: 'path', label: 'path' },
  ]))
}

interface TestOpts {
  prompt?: string
}

export async function agentTest(name: string, opts: TestOpts = {}): Promise<void> {
  const agents = await api.getAvailableAgents()
  const agent = agents.find((a: InstalledAgent) => a.name === name)
  if (!agent) {
    console.error(c.rose('✕ agent não encontrado: ') + name)
    console.log(c.dim('  disponíveis: ' + agents.map((a) => a.name).join(', ')))
    process.exit(1)
  }

  const prompt = opts.prompt || 'Responda apenas a palavra "OK" se você conseguir me ouvir.'
  console.log(divider(`AGENT TEST · ${agent.name}`, 'cyan'))
  console.log(`  ${c.dim('command:')} ${agent.command}`)
  console.log(`  ${c.dim('prompt:')} ${prompt}`)
  console.log()
  process.stdout.write(c.dim('  testando…'))

  const start = Date.now()
  try {
    const res = await rawFetch('/agents/execute', {
      method: 'POST',
      body: JSON.stringify({ agent: agent.name, prompt }),
    })
    const data = await res.json() as { agent: string; output: string; exitCode: number; duration: number }
    const elapsed = Date.now() - start
    process.stdout.write('\r' + ' '.repeat(15) + '\r')

    if (data.exitCode === 0) {
      console.log(`  ${sym.ok} ${c.emerald('OK')} ${c.dim('· ' + elapsed + 'ms')}`)
      console.log(`  ${c.dim('output:')} ${data.output.slice(0, 80)}${data.output.length > 80 ? '…' : ''}`)
    } else {
      console.log(`  ${sym.err} ${c.rose('FAIL')} ${c.dim('· exit=' + data.exitCode)}`)
      console.log(`  ${c.rose(data.output.slice(0, 200))}`)
      process.exit(data.exitCode)
    }
  } catch (err) {
    process.stdout.write('\r' + ' '.repeat(15) + '\r')
    console.log(`  ${sym.err} ${c.rose('erro:')} ${(err as Error).message}`)
    process.exit(1)
  }
}
