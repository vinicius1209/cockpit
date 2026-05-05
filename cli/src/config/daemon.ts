// Daemon URL config — env var > arquivo > default
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'

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

export async function writeConfig(patch: Partial<CliConfig>): Promise<void> {
  const cur = readConfig()
  const next = { ...cur, ...patch }
  await Bun.write(CONFIG_FILE, JSON.stringify(next, null, 2))
}
