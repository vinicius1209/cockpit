// Daemon URL config — env var > arquivo > default
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'

const CONFIG_FILE = join(homedir(), '.cockpit', 'cli.json')

interface CliConfig {
  daemonUrl?: string
  activeWorkspaceSlug?: string
}

export function getDaemonUrl(): string {
  return process.env.COCKPIT_DAEMON_URL || readConfig().daemonUrl || 'http://127.0.0.1:4800'
}

export function readConfig(): CliConfig {
  if (!existsSync(CONFIG_FILE)) return {}
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

export async function readConfigAsync(): Promise<CliConfig> {
  return readConfig()
}

/**
 * C3 fix — atomic write via write-to-temp + rename. POSIX rename(2) e
 * atomico, entao readers nunca veem arquivo truncado / parcialmente
 * escrito. Sem isso, CLI + MCP escrevendo concorrentemente podiam corromper
 * o cli.json.
 *
 * Read-modify-write ainda tem janela de race entre o read (linha "cur")
 * e o write — duas mutacoes simultaneas podem sobrescrever uma a outra.
 * Mas isso eh "lost update" (recuperavel rodando o comando dnv) vs file
 * corruption (nao recuperavel). Atomic write fixa o problema critico.
 */
export async function writeConfig(patch: Partial<CliConfig>): Promise<void> {
  const cur = readConfig()
  const next = { ...cur, ...patch }
  await atomicWriteJson(CONFIG_FILE, next)
}

/**
 * Helper export pra ser usado tambem pelo MCP (mcp/src/index.ts) que
 * escreve no mesmo arquivo. Atomic = no truncated reads.
 */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // Temp file no mesmo dir (rename atomico requer mesmo filesystem)
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmpPath, filePath)
  } catch (err) {
    // Cleanup temp se rename falhou
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw err
  }
}
