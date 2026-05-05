import { c } from './colors'

const VERSION = '0.1.0'

// Banner compact mostrado em comandos top-level. Usa block chars pra remeter
// ao logo aviônico. NUNCA bloquear muita altura — 2 linhas máximo.
export function banner(): string {
  return [
    c.bold(c.cyan('▰▰▰▰▰')) + c.dim(c.gray('  COCKPIT')) + c.dim(' v' + VERSION),
    c.dim(c.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')),
  ].join('\n')
}

// Compact tagline pra comandos secundários
export function compact(daemonOk: boolean, version?: string): string {
  const led = daemonOk ? c.emerald('●') : c.rose('●')
  const status = daemonOk ? c.dim('daemon online') : c.rose('daemon offline')
  const v = version ? c.dim(` v${version}`) : ''
  return `${led} ${status}${v}`
}
