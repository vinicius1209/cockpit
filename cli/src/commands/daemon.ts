import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { api } from '../api/client'
import { getDaemonUrl } from '../config/daemon'
import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'

const LABEL = 'dev.cockpit.daemon'
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const LOG_DIR = join(homedir(), '.cockpit', 'logs')
const LOG_FILE = join(LOG_DIR, 'daemon.log')
const ERR_FILE = join(LOG_DIR, 'daemon.err.log')

function findRepoRoot(): string {
  let dir = new URL(import.meta.url).pathname.replace(/\/[^/]+$/, '')
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'daemon', 'src', 'index.ts'))) return dir
    const up = join(dir, '..')
    if (up === dir) break
    dir = up
  }
  if (existsSync(join(process.cwd(), 'daemon', 'src', 'index.ts'))) return process.cwd()
  throw new Error(
    'nao consegui localizar o repo Cockpit\n' +
    '  ↳ rode este comando dentro da pasta do repo, ou defina COCKPIT_REPO=<path>'
  )
}

function bunPath(): string {
  return Bun.which('bun') || process.execPath
}

function buildPlist(): string {
  const root = process.env.COCKPIT_REPO || findRepoRoot()
  const bp = bunPath()
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bp}</string>
    <string>run</string>
    <string>${root}/daemon/src/index.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${root}/daemon</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_FILE}</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
}

interface RunResult { ok: boolean; out: string; err: string; code: number }

async function run(cmd: string[]): Promise<RunResult> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { ok: code === 0, out, err, code }
}

async function isLoaded(): Promise<boolean> {
  const r = await run(['launchctl', 'list', LABEL])
  return r.ok
}

async function checkHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const h = await api.health()
    return { ok: true, version: h.version }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

function ensureMacOS(): void {
  if (process.platform !== 'darwin') {
    console.error(c.rose('✕ launchd disponivel apenas em macOS'))
    console.error(c.dim('  para Linux, considere systemd: ~/.config/systemd/user/cockpit.service'))
    console.error(c.dim('  para Windows, use Task Scheduler ou WSL'))
    process.exit(1)
  }
}

async function waitForHealth(timeoutMs = 5000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const h = await checkHealth()
    if (h.ok) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

export async function daemonStatus(opts: { asJson?: boolean } = {}): Promise<void> {
  const loaded = process.platform === 'darwin' ? await isLoaded() : false
  const h = await checkHealth()

  if (opts.asJson) {
    console.log(JSON.stringify({
      label: LABEL,
      plistInstalled: existsSync(PLIST_PATH),
      launchAgentLoaded: loaded,
      health: h.ok ? { ok: true, version: h.version } : { ok: false, error: h.error },
      daemonUrl: getDaemonUrl(),
      paths: { plist: PLIST_PATH, log: LOG_FILE, errLog: ERR_FILE },
    }, null, 2))
    return
  }

  console.log(divider('DAEMON STATUS', 'cyan'))
  console.log()

  console.log(section('Process'))
  if (process.platform !== 'darwin') {
    console.log(`  ${sym.warn} ${c.amber('platform nao macOS')} ${c.dim('— launchd indisponivel')}`)
  } else if (loaded) {
    console.log(`  ${sym.ok} launchd ${c.dim('label')} ${c.bold(LABEL)} ${c.emerald('loaded')}`)
  } else if (existsSync(PLIST_PATH)) {
    console.log(`  ${sym.warn} launchd ${c.dim('label')} ${c.bold(LABEL)} ${c.amber('not loaded')}`)
    console.log(`    ${c.dim('rode: cockpit daemon start')}`)
  } else {
    console.log(`  ${sym.idle} launchd ${c.dim('label')} ${c.bold(LABEL)} ${c.gray('not installed')}`)
    console.log(`    ${c.dim('rode: cockpit daemon install')}`)
  }
  console.log()

  console.log(section('Health'))
  const url = getDaemonUrl()
  if (h.ok) {
    console.log(`  ${sym.ok} HTTP ${c.dim(url)} ${c.gray(`v${h.version}`)}`)
  } else {
    console.log(`  ${sym.err} HTTP ${c.dim(url)} ${c.rose(h.error || 'offline')}`)
    console.log(`    ${c.dim('inicie manualmente: bun run dev:daemon')}`)
  }
  console.log()

  console.log(section('Files'))
  fileLine('plist  ', PLIST_PATH)
  fileLine('log    ', LOG_FILE)
  fileLine('errlog ', ERR_FILE)
  console.log()
}

function fileLine(label: string, path: string): void {
  const exists = existsSync(path)
  const led = exists ? c.emerald('●') : c.gray('○')
  console.log(`  ${c.dim(label)} ${led} ${c.dim(path)}`)
}

export async function daemonInstall(): Promise<void> {
  ensureMacOS()
  ensureLogDir()

  if (existsSync(PLIST_PATH)) {
    console.log(c.dim('  recarregando launchagent existente…'))
    await run(['launchctl', 'unload', PLIST_PATH])
  }

  const content = buildPlist()
  writeFileSync(PLIST_PATH, content, 'utf-8')
  console.log(`${sym.check} plist escrito em ${c.dim(PLIST_PATH)}`)

  const r = await run(['launchctl', 'load', '-w', PLIST_PATH])
  if (!r.ok) {
    console.error(c.rose(`✕ launchctl load falhou: ${(r.err || r.out).trim()}`))
    process.exit(1)
  }
  console.log(`${sym.check} launchagent carregado ${c.gray(`(${LABEL})`)}`)

  const ready = await waitForHealth(6000)
  if (ready) {
    const h = await checkHealth()
    console.log(`${sym.check} daemon ${c.emerald('online')} ${c.gray(`v${h.version}`)}`)
  } else {
    console.log(`${sym.warn} daemon ainda nao respondeu ${c.dim('— veja: cockpit daemon logs')}`)
  }

  console.log()
  console.log(c.dim('  ↳ daemon vai iniciar automaticamente no proximo login'))
  console.log(c.dim('  ↳ status:  cockpit daemon status'))
  console.log(c.dim('  ↳ logs:    cockpit daemon logs'))
  console.log(c.dim('  ↳ remover: cockpit daemon uninstall'))
}

export async function daemonUninstall(): Promise<void> {
  ensureMacOS()
  if (!existsSync(PLIST_PATH)) {
    console.log(`${sym.warn} ${c.amber('launchagent nao instalado')}`)
    return
  }
  await run(['launchctl', 'unload', '-w', PLIST_PATH])
  unlinkSync(PLIST_PATH)
  console.log(`${sym.check} launchagent removido`)
  console.log(c.dim('  daemon nao vai mais iniciar no login'))
  console.log(c.dim('  para subir manualmente: bun run dev:daemon'))
}

export async function daemonStart(): Promise<void> {
  ensureMacOS()
  if (!existsSync(PLIST_PATH)) {
    console.error(c.rose('✕ launchagent nao instalado'))
    console.error(c.dim('  rode primeiro: cockpit daemon install'))
    process.exit(1)
  }
  if (await isLoaded()) {
    console.log(`${sym.warn} ${c.amber('ja esta rodando')}`)
    const h = await checkHealth()
    if (h.ok) console.log(`  ${c.dim('health:')} ${c.emerald('ok')} ${c.gray(`v${h.version}`)}`)
    return
  }
  const r = await run(['launchctl', 'load', PLIST_PATH])
  if (!r.ok) {
    console.error(c.rose(`✕ falha ao iniciar: ${(r.err || r.out).trim()}`))
    process.exit(1)
  }
  const ready = await waitForHealth(6000)
  if (ready) {
    const h = await checkHealth()
    console.log(`${sym.check} daemon ${c.emerald('online')} ${c.gray(`v${h.version}`)}`)
  } else {
    console.log(`${sym.warn} daemon iniciado mas nao respondeu — veja cockpit daemon logs`)
  }
}

export async function daemonStop(): Promise<void> {
  ensureMacOS()
  if (!existsSync(PLIST_PATH)) {
    console.error(c.rose('✕ launchagent nao instalado'))
    process.exit(1)
  }
  if (!(await isLoaded())) {
    console.log(`${sym.warn} ${c.amber('ja esta parado')}`)
    return
  }
  const r = await run(['launchctl', 'unload', PLIST_PATH])
  if (!r.ok) {
    console.error(c.rose(`✕ falha ao parar: ${(r.err || r.out).trim()}`))
    process.exit(1)
  }
  console.log(`${sym.check} daemon ${c.dim('parado')}`)
  console.log(c.dim('  ↳ inicia novamente no proximo login (KeepAlive)'))
  console.log(c.dim('  ↳ subir agora: cockpit daemon start'))
}

export async function daemonRestart(): Promise<void> {
  ensureMacOS()
  await daemonStop()
  await new Promise((r) => setTimeout(r, 800))
  await daemonStart()
}

export async function daemonLogs(opts: { follow?: boolean; lines?: number; err?: boolean } = {}): Promise<void> {
  const file = opts.err ? ERR_FILE : LOG_FILE
  if (!existsSync(file)) {
    console.error(c.rose(`✕ log nao encontrado: ${file}`))
    console.error(c.dim('  o daemon ainda nao foi iniciado via launchd'))
    console.error(c.dim('  rode: cockpit daemon install'))
    process.exit(1)
  }
  const args = ['tail', '-n', String(opts.lines ?? 100)]
  if (opts.follow) args.push('-f')
  args.push(file)

  const proc = Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' })
  await proc.exited
}
