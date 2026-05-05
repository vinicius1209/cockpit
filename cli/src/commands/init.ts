import { loadAll } from '../api/store'
import { resolveWorkspace } from '../api/resolve'
import { c, sym } from '../ui/colors'
import { divider } from '../ui/box'
import { rawFetch } from '../api/client'
import { readConfigAsync } from '../config/daemon'
import { join } from 'node:path'

interface InitOpts {
  ws?: string
  name?: string  // project name
}

// Bootstrap .cockpit/config.json no projeto atual e vincula ao workspace.
// Usa /projects/sync-config (N7) que ja existe no daemon.
export async function init(opts: InitOpts = {}): Promise<void> {
  const cwd = process.cwd()
  const projectName = opts.name || cwd.split('/').pop() || 'projeto'

  console.log(divider('INIT', 'cyan'))
  console.log()
  console.log(`  ${c.dim('cwd:')} ${cwd.replace(/^\/Users\/[^/]+\//, '~/')}`)
  console.log(`  ${c.dim('proj:')} ${c.bold(projectName)}`)
  console.log()

  const cli = await readConfigAsync()
  const { workspaces } = await loadAll()

  // Resolve workspace
  const ws = opts.ws
    ? resolveWorkspace(opts.ws, workspaces)
    : workspaces.find((w) => w.slug === cli.activeWorkspaceSlug)
    || workspaces[0]

  if (!ws) {
    console.error(c.rose('✕ nenhum workspace disponivel'))
    console.log(c.dim('  crie um: cockpit ws new "<nome>"'))
    process.exit(1)
  }

  console.log(`  ${c.dim('workspace:')} ${c.bold(ws.name)} ${c.dim('#' + ws.slug)}`)
  console.log()

  // Carrega agentes do workspace
  const agentsRes = await rawFetch('/api/data/agents')
  const env = await agentsRes.json() as { state?: { configs?: Record<string, unknown[]> } }
  const wsAgents = env.state?.configs?.[ws.id] || []

  if (wsAgents.length === 0) {
    console.error(c.rose('✕ workspace sem agentes configurados'))
    console.log(c.dim('  configure pelo web UI > workspace settings > Agentes'))
    process.exit(1)
  }

  // Sync via /projects/sync-config
  console.log(c.dim('  sincronizando agentes…'))
  try {
    const res = await rawFetch('/projects/sync-config', {
      method: 'POST',
      body: JSON.stringify({
        path: cwd,
        agents: wsAgents,
        workspaceName: ws.name,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
      throw new Error(err.error || 'sync falhou')
    }
    const data = await res.json() as { configPath: string; agentsExported: number; syncedAt: string }
    console.log(`  ${sym.ok} ${c.emerald('config criada')}`)
    console.log(`     ${c.dim(data.configPath.replace(/^\/Users\/[^/]+\//, '~/'))}`)
    console.log(`     ${c.dim(data.agentsExported + ' agentes exportados')}`)
  } catch (err) {
    console.error(c.rose('✕ ') + (err as Error).message)
    process.exit(1)
  }

  console.log()
  console.log(c.dim('  ━ proximos passos:'))
  console.log(c.dim(`    ${c.bold('cockpit card new "Titulo"')} criar card`))
  console.log(c.dim(`    ${c.bold('cockpit board')} ver kanban`))
  console.log(c.dim(`    edite ${join(cwd, '.cockpit/config.json').replace(/^\/Users\/[^/]+\//, '~/')} pra customizar`))
}
