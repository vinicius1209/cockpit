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
        await doctor()
        return
      }

      case 'ws':
      case 'workspace':
      case 'workspaces': {
        const { wsList, wsUse, wsInfo } = await import('./commands/ws')
        if (!sub || sub === 'list') return wsList(!!flags.json)
        if (sub === 'use') {
          if (!rest[0]) return errorExit('uso: cockpit ws use <name>')
          return wsUse(rest[0])
        }
        if (sub === 'info') return wsInfo(rest[0])
        return errorExit(`subcomando ws nao reconhecido: ${sub}`)
      }

      case 'board': {
        const { board } = await import('./commands/board')
        return board(sub)
      }

      case 'card':
      case 'cards': {
        const { cardList, cardShow } = await import('./commands/card')
        if (!sub || sub === 'list') {
          return cardList({
            ws: flags.ws as string | undefined,
            type: flags.type as string | undefined,
            priority: flags.priority as string | undefined,
            status: flags.status as string | undefined,
            asJson: !!flags.json,
          })
        }
        if (sub === 'show') {
          if (!rest[0]) return errorExit('uso: cockpit card show <#id>')
          return cardShow(rest[0])
        }
        return errorExit(`subcomando card nao implementado ainda: ${sub}\n  veja TODO_CLI.md`)
      }

      // Tier 2-4 placeholder
      case 'implement':
      case 'spec':
      case 'watch':
      case 'log':
      case 'ai':
      case 'metrics':
      case 'agent':
      case 'init':
      case 'search':
        return errorExit(
          `comando "${main}" ainda nao implementado.\n  ` +
          `${c.dim('roadmap em TODO_CLI.md')} ${c.dim('— por enquanto use o web UI')}`,
        )

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
  process.exit(1)
}

main()
