#!/usr/bin/env bun
import { c } from './ui/colors'

// ── Argument parsing (zero-dep) ──
interface ParsedArgs {
  cmd: string[]      // positional after flags
  flags: Record<string, string | boolean>
}

function parseArgs(argv: string[]): ParsedArgs {
  const cmd: string[] = []
  const flags: Record<string, string | boolean> = {}
  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1)
      } else {
        const next = argv[i + 1]
        if (next && !next.startsWith('-')) {
          flags[a.slice(2)] = next
          i++
        } else {
          flags[a.slice(2)] = true
        }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      flags[a.slice(1)] = true
    } else {
      cmd.push(a)
    }
    i++
  }
  return { cmd, flags }
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv.slice(2))

  if (flags.h || flags.help) {
    const { help } = await import('./commands/help')
    help(cmd[0])
    return
  }

  // Default: status overview
  if (cmd.length === 0) {
    const { status } = await import('./commands/status')
    await status()
    return
  }

  const [main, sub, ...rest] = cmd

  try {
    switch (main) {
      case 'help': {
        const { help } = await import('./commands/help')
        help(sub)
        return
      }

      case 'doctor': {
        const { doctor } = await import('./commands/doctor')
        await doctor({ fix: !!flags.fix, asJson: !!flags.json })
        return
      }

      case 'tui': {
        const { tui } = await import('./commands/tui')
        return tui()
      }

      case 'daemon': {
        const {
          daemonStatus, daemonInstall, daemonUninstall,
          daemonStart, daemonStop, daemonRestart, daemonLogs,
        } = await import('./commands/daemon')
        if (!sub || sub === 'status') return daemonStatus({ asJson: !!flags.json })
        if (sub === 'install') return daemonInstall()
        if (sub === 'uninstall' || sub === 'remove') return daemonUninstall()
        if (sub === 'start') return daemonStart()
        if (sub === 'stop') return daemonStop()
        if (sub === 'restart') return daemonRestart()
        if (sub === 'logs') {
          return daemonLogs({
            follow: !!flags.follow || !!flags.f,
            lines: flags.lines ? Number(flags.lines) : (flags.n ? Number(flags.n) : undefined),
            err: !!flags.err || !!flags.stderr,
          })
        }
        return errorExit(`subcomando daemon nao reconhecido: ${sub}`)
      }

      case 'ws':
      case 'workspace':
      case 'workspaces': {
        const { wsList, wsUse, wsInfo, wsNew, wsDelete } = await import('./commands/ws')
        if (!sub || sub === 'list') return wsList(!!flags.json)
        if (sub === 'use') {
          if (!rest[0]) return errorExit('uso: cockpit ws use <name>')
          return wsUse(rest[0])
        }
        if (sub === 'info') return wsInfo(rest[0])
        if (sub === 'new') {
          if (!rest[0]) return errorExit('uso: cockpit ws new "<name>"')
          return wsNew(rest[0], {
            color: flags.color as string | undefined,
            description: flags.desc as string | undefined,
          })
        }
        if (sub === 'delete' || sub === 'rm') {
          if (!rest[0]) return errorExit('uso: cockpit ws delete <name> [--force]')
          return wsDelete(rest[0], !!flags.force)
        }
        return errorExit(`subcomando ws nao reconhecido: ${sub}`)
      }

      case 'board': {
        const { board } = await import('./commands/board')
        return board(sub)
      }

      case 'card':
      case 'cards': {
        const { cardList, cardShow, cardNew, cardMove, cardDelete, cardEdit, cardArchive, cardUnarchive } = await import('./commands/card')
        if (!sub || sub === 'list') {
          return cardList({
            ws: flags.ws as string | undefined,
            type: flags.type as string | undefined,
            priority: flags.priority as string | undefined,
            status: flags.status as string | undefined,
            asJson: !!flags.json,
            includeArchived: !!flags['include-archived'],
            onlyArchived: !!flags['only-archived'] || !!flags.archived,
          })
        }
        if (sub === 'archive' || sub === 'discard') {
          if (!rest[0]) return errorExit('uso: cockpit card archive <id>')
          return cardArchive(rest[0])
        }
        if (sub === 'unarchive' || sub === 'restore') {
          if (!rest[0]) return errorExit('uso: cockpit card unarchive <id>')
          return cardUnarchive(rest[0])
        }
        if (sub === 'show') {
          if (!rest[0]) return errorExit('uso: cockpit card show <id>')
          return cardShow(rest[0])
        }
        if (sub === 'new') {
          if (!rest[0]) return errorExit('uso: cockpit card new "<title>"')
          return cardNew(rest[0], {
            type: flags.type as string | undefined,
            priority: (flags.priority || flags.prio) as string | undefined,
            ws: flags.ws as string | undefined,
            col: (flags.col || flags.column) as string | undefined,
            description: flags.desc as string | undefined,
          })
        }
        if (sub === 'move' || sub === 'mv') {
          if (!rest[0] || !rest[1]) return errorExit('uso: cockpit card move <id> <column-slug>')
          return cardMove(rest[0], rest[1])
        }
        if (sub === 'delete' || sub === 'rm') {
          if (!rest[0]) return errorExit('uso: cockpit card delete <id> [--force]')
          return cardDelete(rest[0], !!flags.force)
        }
        if (sub === 'edit') {
          if (!rest[0]) return errorExit('uso: cockpit card edit <id> [--title ...]')
          return cardEdit(rest[0], {
            title: flags.title as string | undefined,
            type: flags.type as string | undefined,
            priority: (flags.priority || flags.prio) as string | undefined,
            assignee: flags.assignee as string | undefined,
            due: flags.due as string | undefined,
          })
        }
        return errorExit(`subcomando card nao reconhecido: ${sub}`)
      }

      case 'implement': {
        const { implement } = await import('./commands/implement')
        if (!sub) return errorExit('uso: cockpit implement <id> [--watch] [--feedback "..."] [--isolation worktree]')
        const iso = flags.isolation as string | undefined
        if (iso && iso !== 'lock' && iso !== 'worktree') {
          return errorExit(`--isolation invalido: "${iso}". Use lock ou worktree.`)
        }
        return implement(sub, {
          feedback: flags.feedback as string | undefined,
          watch: !!flags.watch,
          noPr: !!flags['no-pr'],
          isolation: (iso as 'lock' | 'worktree' | undefined) ?? (flags.worktree ? 'worktree' : undefined),
        })
      }

      case 'watch': {
        const { watch, watchAll } = await import('./commands/watch')
        if (flags.all || sub === '--all' || sub === 'all') {
          return watchAll({
            includeCompleted: !!flags['include-completed'],
          })
        }
        if (!sub) return errorExit('uso: cockpit watch <id> [--action spec|implementation|chat]\n  ou: cockpit watch --all  (multiplex de todas sessions running)')
        return watch(sub, {
          action: flags.action as 'spec' | 'implementation' | 'discovery' | 'chat' | undefined,
        })
      }

      case 'log': {
        const { log } = await import('./commands/log')
        if (!sub) return errorExit('uso: cockpit log <id>')
        return log(sub, {
          last: flags.last ? Number(flags.last) : undefined,
          asJson: !!flags.json,
        })
      }

      case 'alarm':
      case 'notify': {
        const { alarm } = await import('./commands/alarm')
        const ref = (flags.all || sub === '--all' || sub === 'all') ? undefined : sub
        return alarm(ref, {
          all: !!flags.all || sub === '--all' || sub === 'all',
          silent: !!flags.silent,
          sound: flags.sound as string | undefined,
          action: flags.action as 'spec' | 'implementation' | 'discovery' | 'chat' | undefined,
        })
      }

      case 'ai': {
        const { ai } = await import('./commands/ai')
        if (!sub) return errorExit('uso: cockpit ai <id>')
        return ai(sub)
      }

      case 'metrics': {
        const { metrics } = await import('./commands/metrics')
        return metrics({ asJson: !!flags.json })
      }

      case 'agent':
      case 'agents': {
        const { agentList, agentTest } = await import('./commands/agent')
        if (!sub || sub === 'list') return agentList(!!flags.json)
        if (sub === 'test') {
          if (!rest[0]) return errorExit('uso: cockpit agent test <name> [--prompt "..."]')
          return agentTest(rest[0], { prompt: flags.prompt as string | undefined })
        }
        return errorExit(`subcomando agent nao reconhecido: ${sub}`)
      }

      case 'init': {
        const { init } = await import('./commands/init')
        return init({
          ws: flags.ws as string | undefined,
          name: flags.name as string | undefined,
        })
      }

      case 'search': {
        const { search } = await import('./commands/search')
        if (!sub) return errorExit('uso: cockpit search "<query>"')
        return search(sub, {
          in: flags.in as string | undefined,
          asJson: !!flags.json,
          limit: flags.limit ? Number(flags.limit) : undefined,
        })
      }

      case 'spec': {
        const { specShow, specGen, specReady, specReset, specEdit, specSaveVault } = await import('./commands/spec')
        if (!sub) return errorExit('uso: cockpit spec show|gen|edit|ready|reset|save-vault <id>')
        if (sub === 'show') {
          if (!rest[0]) return errorExit('uso: cockpit spec show <id>')
          return specShow(rest[0])
        }
        if (sub === 'gen' || sub === 'generate') {
          if (!rest[0]) return errorExit('uso: cockpit spec gen <id> [--watch]')
          return specGen(rest[0], { watch: !!flags.watch })
        }
        if (sub === 'ready') {
          if (!rest[0]) return errorExit('uso: cockpit spec ready <id>')
          return specReady(rest[0])
        }
        if (sub === 'reset') {
          if (!rest[0]) return errorExit('uso: cockpit spec reset <id> [--force]')
          return specReset(rest[0], !!flags.force)
        }
        if (sub === 'edit') {
          if (!rest[0]) return errorExit('uso: cockpit spec edit <id>')
          return specEdit(rest[0])
        }
        if (sub === 'save-vault' || sub === 'vault') {
          if (!rest[0]) return errorExit('uso: cockpit spec save-vault <id>')
          return specSaveVault(rest[0])
        }
        return errorExit(`subcomando spec nao reconhecido: ${sub}`)
      }

      default:
        errorExit(`comando desconhecido: ${main}\n  use ${c.bold('cockpit help')} para listar`)
    }
  } catch (err) {
    console.error(c.rose('✕ erro: ') + (err instanceof Error ? err.message : String(err)))
    if (flags.v || flags.verbose) {
      console.error(err)
    }
    process.exit(1)
  }
}

function errorExit(msg: string): never {
  console.error(c.rose('✕ ') + msg)
  // Hint comum: zsh com interactive_comments trata `#` como inicio de
  // comentario, fazendo o argumento sumir antes de chegar no CLI.
  if (msg.includes('<id>') || msg.includes('<column-slug>')) {
    console.error(c.dim('  dica: nao use # antes do id (#SW78). zsh/bash tratam como comentario.'))
    console.error(c.dim('         use apenas: ') + c.bold('cockpit card show SW78'))
  }
  process.exit(1)
}

main()
