import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { banner } from '../ui/banner'

const COMMANDS: Array<{ cmd: string; desc: string; group: string }> = [
  // Status & info
  { cmd: 'cockpit',                       desc: 'status overview global',                                     group: 'status' },
  { cmd: 'cockpit tui',                   desc: 'TUI fullscreen — board kanban interativo + sessions live',   group: 'status' },
  { cmd: 'cockpit doctor [--fix]',        desc: 'health check + auto-fix (locks orfaos, sessions zumbis)',    group: 'status' },
  { cmd: 'cockpit metrics',               desc: 'dashboards de uso (cards, runs, velocity)',                  group: 'status' },
  { cmd: 'cockpit help [cmd]',            desc: 'ajuda',                                                      group: 'status' },

  // Daemon lifecycle (launchd no macOS)
  { cmd: 'cockpit daemon status',         desc: 'health + estado do launchagent',                             group: 'daemon' },
  { cmd: 'cockpit daemon install',        desc: 'instala launchagent (auto-start no login)',                  group: 'daemon' },
  { cmd: 'cockpit daemon uninstall',      desc: 'remove launchagent',                                         group: 'daemon' },
  { cmd: 'cockpit daemon start',          desc: 'sobe daemon agora',                                          group: 'daemon' },
  { cmd: 'cockpit daemon stop',           desc: 'para daemon (volta no proximo login)',                       group: 'daemon' },
  { cmd: 'cockpit daemon restart',        desc: 'stop + start',                                               group: 'daemon' },
  { cmd: 'cockpit daemon logs',           desc: 'tail dos logs (--follow --lines N --err)',                   group: 'daemon' },

  // Workspaces
  { cmd: 'cockpit ws',                    desc: 'lista workspaces',                                           group: 'ws' },
  { cmd: 'cockpit ws use <name>',         desc: 'set workspace ativo (CLI)',                                  group: 'ws' },
  { cmd: 'cockpit ws info [name]',        desc: 'detalhes do workspace',                                      group: 'ws' },
  { cmd: 'cockpit ws new "<name>"',       desc: 'cria novo workspace (--color --desc)',                       group: 'ws' },
  { cmd: 'cockpit ws delete <name>',      desc: 'exclui workspace (--force)',                                 group: 'ws' },

  // Board & cards
  { cmd: 'cockpit board [ws]',            desc: 'ASCII kanban',                                               group: 'card' },
  { cmd: 'cockpit card list',             desc: 'lista cards (--ws --type --priority --status --json)',       group: 'card' },
  { cmd: 'cockpit card show <id>',       desc: 'ficha completa do card',                                     group: 'card' },
  { cmd: 'cockpit card new "<title>"',    desc: 'cria card (--type --prio --ws --col --desc)',                group: 'card' },
  { cmd: 'cockpit card move <id> <col>', desc: 'move card de coluna',                                        group: 'card' },
  { cmd: 'cockpit card edit <id>',       desc: 'edita campos (--title --type --prio --assignee --due)',      group: 'card' },
  { cmd: 'cockpit card delete <id>',     desc: 'exclui card permanente (--force)',                           group: 'card' },
  { cmd: 'cockpit card archive <id>',    desc: 'descarta card (mantem historico, alias: discard)',           group: 'card' },
  { cmd: 'cockpit card unarchive <id>',  desc: 'reativa card descartado (alias: restore)',                   group: 'card' },

  // Spec lifecycle
  { cmd: 'cockpit spec show <id>',       desc: 'imprime markdown da spec',                                    group: 'spec' },
  { cmd: 'cockpit spec gen <id>',        desc: 'gera spec via AI (--watch)',                                  group: 'spec' },
  { cmd: 'cockpit spec edit <id>',       desc: 'abre $EDITOR (vim/nano/etc)',                                 group: 'spec' },
  { cmd: 'cockpit spec ready <id>',      desc: 'aprova spec (draft → ready)',                                 group: 'spec' },
  { cmd: 'cockpit spec reset <id>',      desc: 'apaga spec atual (--force)',                                  group: 'spec' },
  { cmd: 'cockpit spec save-vault <id>', desc: 'copia spec para Docs Vault',                                  group: 'spec' },

  // Long-running
  { cmd: 'cockpit implement <id>',       desc: 'dispara implementacao (--watch --feedback --no-pr --isolation worktree)', group: 'run' },
  { cmd: 'cockpit watch <id>',           desc: 'tail live de session (--action spec|implementation|chat)',  group: 'run' },
  { cmd: 'cockpit watch --all',          desc: 'multiplex SSE — todas sessions running em uma timeline',     group: 'run' },
  { cmd: 'cockpit alarm <id>',           desc: 'notify do OS quando session terminar (--silent --sound)',    group: 'run' },
  { cmd: 'cockpit alarm --all',          desc: 'notify ao fim de cada session running',                      group: 'run' },
  { cmd: 'cockpit log <id>',             desc: 'historico de sessions (--last N --json)',                    group: 'run' },
  { cmd: 'cockpit ai <id>',              desc: 'AI chat interativo no terminal (REPL)',                      group: 'run' },

  // Misc
  { cmd: 'cockpit agent list',            desc: 'lista CLI agents detectados',                                group: 'misc' },
  { cmd: 'cockpit agent test <name>',     desc: 'hello-world num agent (--prompt "...")',                     group: 'misc' },
  { cmd: 'cockpit init',                  desc: 'bootstrap .cockpit/config.json na pasta atual (--ws)',       group: 'misc' },
  { cmd: 'cockpit search "<q>"',          desc: 'busca em cards/specs/docs (--in cards|specs --limit N)',     group: 'misc' },
]

const GROUP_LABELS: Record<string, string> = {
  status: 'Status & info',
  daemon: 'Daemon (macOS launchd)',
  ws: 'Workspaces',
  card: 'Board & cards',
  spec: 'Spec lifecycle',
  run: 'Long-running',
  misc: 'Misc',
}

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

  console.log(divider('COMMANDS', 'gray'))
  console.log()

  for (const groupKey of Object.keys(GROUP_LABELS)) {
    const groupCmds = COMMANDS.filter((cmd) => cmd.group === groupKey)
    if (groupCmds.length === 0) continue
    console.log(section(GROUP_LABELS[groupKey]))
    for (const cmd of groupCmds) {
      console.log(`  ${c.bold(cmd.cmd.padEnd(36))} ${c.dim(cmd.desc)}`)
    }
    console.log()
  }

  console.log(section('Flags globais'))
  console.log(`  ${c.bold('--json'.padEnd(34))} ${c.dim('output em JSON (machine readable)')}`)
  console.log(`  ${c.bold('--help, -h'.padEnd(34))} ${c.dim('ajuda do comando')}`)
  console.log(`  ${c.bold('NO_COLOR=1'.padEnd(34))} ${c.dim('desabilita cores (env)')}`)
  console.log(`  ${c.bold('COCKPIT_DAEMON_URL=...'.padEnd(34))} ${c.dim('override URL do daemon')}`)
  console.log()
  console.log(`  ${sym.bullet} repo: ${c.dim('github.com/anthropics/cockpit')}`)
  console.log(`  ${sym.bullet} docs: ${c.dim('cockpit help <cmd>')}`)
}
