import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { banner } from '../ui/banner'

const COMMANDS: Array<{ cmd: string; desc: string; tier: 1 | 2 | 3 | 4 }> = [
  // Tier 1 — read
  { cmd: 'cockpit',                   desc: 'status overview global', tier: 1 },
  { cmd: 'cockpit doctor',            desc: 'health check (daemon, agents, projetos, gh)', tier: 1 },
  { cmd: 'cockpit ws',                desc: 'lista workspaces', tier: 1 },
  { cmd: 'cockpit ws use <name>',     desc: 'set workspace ativo (CLI)', tier: 1 },
  { cmd: 'cockpit ws info [name]',    desc: 'detalhes do workspace', tier: 1 },
  { cmd: 'cockpit board [ws]',        desc: 'ASCII kanban', tier: 1 },
  { cmd: 'cockpit card list',         desc: 'lista cards (filtros: --type, --priority, --status, --ws)', tier: 1 },
  { cmd: 'cockpit card show <#id>',   desc: 'ficha completa do card', tier: 1 },
  { cmd: 'cockpit help [cmd]',        desc: 'ajuda', tier: 1 },

  // Tier 2 — write (TODO)
  { cmd: 'cockpit card new "<title>"', desc: '[em breve] cria card novo', tier: 2 },
  { cmd: 'cockpit card move <id> <col>', desc: '[em breve] move card de coluna', tier: 2 },
  { cmd: 'cockpit card edit <id>',    desc: '[em breve] edita card no editor', tier: 2 },

  // Tier 3 — long-running (TODO)
  { cmd: 'cockpit implement <id>',    desc: '[em breve] dispara implementacao', tier: 3 },
  { cmd: 'cockpit watch <id>',        desc: '[em breve] tail live de execucao', tier: 3 },
  { cmd: 'cockpit log <id>',          desc: '[em breve] historico de sessions', tier: 3 },
  { cmd: 'cockpit ai <id>',           desc: '[em breve] AI chat interativo', tier: 3 },

  // Tier 4
  { cmd: 'cockpit metrics',           desc: '[em breve] dashboards de uso', tier: 4 },
  { cmd: 'cockpit init',              desc: '[em breve] bootstrap .cockpit/ na pasta atual', tier: 4 },
  { cmd: 'cockpit search "<q>"',      desc: '[em breve] busca em cards/specs/docs', tier: 4 },
]

export function help(commandName?: string): void {
  console.log(banner())
  console.log()

  if (commandName) {
    const match = COMMANDS.find((c) => c.cmd.includes(commandName))
    if (match) {
      console.log(`  ${c.bold(match.cmd)}`)
      console.log(`  ${c.dim(match.desc)}`)
    } else {
      console.log(c.dim(`  comando "${commandName}" nao encontrado`))
    }
    console.log()
    return
  }

  console.log(divider('CMDS', 'gray'))
  console.log()
  console.log(section('Tier 1 · disponiveis'))
  for (const cmd of COMMANDS.filter((c) => c.tier === 1)) {
    console.log(`  ${c.bold(cmd.cmd.padEnd(34))} ${c.dim(cmd.desc)}`)
  }
  console.log()
  console.log(section('Tier 2-4 · em desenvolvimento'))
  for (const cmd of COMMANDS.filter((c) => c.tier > 1)) {
    console.log(`  ${c.dim(cmd.cmd.padEnd(34))} ${c.dim(cmd.desc)}`)
  }
  console.log()
  console.log(section('Flags globais'))
  console.log(`  ${c.bold('--json'.padEnd(34))} ${c.dim('output em JSON (machine readable)')}`)
  console.log(`  ${c.bold('--help, -h'.padEnd(34))} ${c.dim('ajuda do comando')}`)
  console.log(`  ${c.bold('NO_COLOR=1'.padEnd(34))} ${c.dim('desabilita cores (env)')}`)
  console.log(`  ${c.bold('COCKPIT_DAEMON_URL=...'.padEnd(34))} ${c.dim('override URL do daemon')}`)
  console.log()
  console.log(`  ${sym.bullet} repo: ${c.dim('github.com/anthropics/cockpit')}`)
  console.log(`  ${sym.bullet} docs: ${c.dim('cockpit help <cmd>')}`)
}
