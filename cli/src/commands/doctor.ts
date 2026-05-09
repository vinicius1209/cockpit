// `cockpit doctor` — health + manutencao com severidade.
//
// Cada check retorna 0..N Issues. Issues sao agregadas, agrupadas por
// severidade no output. Modo --json pra scripting (CI, monitoring).
//
// Severidades:
//   critical — bloqueia uso (daemon offline, agents zero, etc)
//   warning  — atencao necessaria mas funcional (locks orfaos, hooks invalidos)
//   info     — informativo (disk usage, sugestoes)
//
// Cada Issue pode ter `fix` opcional → executavel com --fix.

import { api, rawFetch } from '../api/client'
import { loadWorkspaces, loadProjects } from '../api/store'
import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { getDaemonUrl } from '../config/daemon'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

interface DoctorOpts {
  fix?: boolean
  asJson?: boolean
}

type Severity = 'critical' | 'warning' | 'info'

interface Issue {
  id: string
  severity: Severity
  /** Titulo curto (ex: "project locks orfaos: 3") */
  title: string
  /** Detalhe adicional opcional */
  detail?: string
  /** Acao manual sugerida (string ou multilinhas) */
  hint?: string
  /** Fix automatizado opcional. Retorna `{ ok, msg }`. */
  fix?: () => Promise<{ ok: boolean; msg: string }>
}

interface CheckGroup {
  label: string
  /** Linhas a renderizar (cada uma com led + texto). Ja formatadas. */
  lines: string[]
  /** Issues levantadas por este grupo */
  issues: Issue[]
}

export async function doctor(opts: DoctorOpts = {}): Promise<void> {
  const groups: CheckGroup[] = []
  const allIssues: Issue[] = []

  // ─── 1. Daemon health ───
  const daemonGroup = await checkDaemon()
  groups.push(daemonGroup)
  allIssues.push(...daemonGroup.issues)

  const daemonOk = !daemonGroup.issues.some((i) => i.severity === 'critical')

  // Se daemon offline, abortar (resto dos checks depende dele).
  if (!daemonOk) {
    if (opts.asJson) {
      console.log(JSON.stringify({ status: 'degraded', issues: allIssues, groups: groups.map((g) => ({ label: g.label })) }, null, 2))
      process.exit(1)
    }
    renderHuman(groups, allIssues, opts)
    process.exit(1)
  }

  // ─── 2-9. Demais checks (paralelo onde possivel) ───
  const [agents, workspaces, projects, gh, locks, sessions, brokenProjects, pathCheck, version, worktrees, hooks, mcpCfg, diskUsage] = await Promise.all([
    checkAgents(),
    checkWorkspaces(),
    checkProjects(),
    checkGhCli(),
    checkLocks(),
    checkZombieSessions(),
    checkBrokenProjects(),
    checkCockpitInPath(),
    checkVersionDrift(),
    checkOrphanWorktrees(),
    checkInvalidHooks(),
    checkMcpConfig(),
    checkDiskUsage(),
  ])

  groups.push(agents, workspaces, projects, gh)
  for (const g of [locks, sessions, brokenProjects, pathCheck, version, worktrees, hooks, mcpCfg, diskUsage]) {
    if (g.lines.length > 0 || g.issues.length > 0) groups.push(g)
  }
  for (const g of groups.slice(1)) allIssues.push(...g.issues)

  // ─── Output ───
  if (opts.asJson) {
    const c0 = allIssues.filter((i) => i.severity === 'critical').length
    const w0 = allIssues.filter((i) => i.severity === 'warning').length
    const status = c0 > 0 ? 'degraded' : w0 > 0 ? 'warnings' : 'ok'
    console.log(JSON.stringify({
      status,
      total_issues: allIssues.length,
      by_severity: {
        critical: allIssues.filter((i) => i.severity === 'critical').length,
        warning: allIssues.filter((i) => i.severity === 'warning').length,
        info: allIssues.filter((i) => i.severity === 'info').length,
      },
      issues: allIssues.map(({ fix, ...rest }) => ({ ...rest, fixable: !!fix })),
    }, null, 2))
    return
  }

  await renderHuman(groups, allIssues, opts)
}

// ─── Renderer humano ───

async function renderHuman(groups: CheckGroup[], allIssues: Issue[], opts: DoctorOpts): Promise<void> {
  console.log(divider('SYSTEM CHECK', 'cyan'))
  console.log()

  for (const g of groups) {
    if (g.lines.length === 0 && g.issues.length === 0) continue
    console.log(section(g.label))
    for (const ln of g.lines) console.log('  ' + ln)
    if (g.lines.length === 0 && g.issues.length === 0) {
      console.log('  ' + sym.dot + ' ' + c.dim('(sem dados)'))
    }
    console.log()
  }

  // Issues agregadas
  if (allIssues.length > 0) {
    const critical = allIssues.filter((i) => i.severity === 'critical')
    const warnings = allIssues.filter((i) => i.severity === 'warning')
    const infos = allIssues.filter((i) => i.severity === 'info')

    console.log(divider('ISSUES', critical.length > 0 ? 'rose' : 'amber'))
    console.log()

    for (const list of [
      { items: critical, sev: 'critical' as const, label: c.rose('CRITICAL') },
      { items: warnings, sev: 'warning' as const, label: c.amber('WARNING') },
      { items: infos, sev: 'info' as const, label: c.dim('INFO') },
    ]) {
      if (list.items.length === 0) continue
      console.log(`  ${list.label} ${c.dim('· ' + list.items.length)}`)
      for (const issue of list.items) {
        const led = list.sev === 'critical' ? c.rose('●') : list.sev === 'warning' ? c.amber('●') : c.dim('●')
        console.log(`    ${led} ${issue.title}`)
        if (issue.detail) console.log(`      ${c.dim(issue.detail)}`)
        if (issue.hint) console.log(`      ${c.dim('↳ ' + issue.hint)}`)
        if (opts.fix && issue.fix) {
          process.stdout.write(`      ${c.dim('→ corrigindo... ')}`)
          const r = await issue.fix()
          console.log(r.ok ? c.emerald(r.msg) : c.rose(r.msg))
        } else if (issue.fix && !opts.fix) {
          console.log(`      ${c.dim('↳ auto-fix:')} ${c.bold('cockpit doctor --fix')}`)
        }
      }
      console.log()
    }
  }

  // Summary final
  console.log(divider('SUMMARY', 'gray'))
  const c0 = allIssues.filter((i) => i.severity === 'critical').length
  const w0 = allIssues.filter((i) => i.severity === 'warning').length
  const i0 = allIssues.filter((i) => i.severity === 'info').length
  const status = c0 > 0 ? c.rose('● degraded')
    : w0 > 0 ? c.amber('● operational with warnings')
    : c.emerald('● operational')
  console.log(`  ${status}`)
  if (c0 + w0 + i0 === 0) {
    console.log(`  ${c.emerald('0 issues')}`)
  } else {
    const parts: string[] = []
    if (c0 > 0) parts.push(c.rose(`${c0} critical`))
    if (w0 > 0) parts.push(c.amber(`${w0} warning${w0 > 1 ? 's' : ''}`))
    if (i0 > 0) parts.push(c.dim(`${i0} info`))
    console.log('  ' + parts.join(c.dim(' · ')))
  }
}

// ─── Checks ───

async function checkDaemon(): Promise<CheckGroup> {
  const daemonUrl = getDaemonUrl()
  try {
    const h = await api.health()
    return {
      label: 'Daemon',
      lines: [`${sym.ok} daemon ${c.dim(daemonUrl)} ${c.gray(`v${h.version}`)}`],
      issues: [],
    }
  } catch (err) {
    return {
      label: 'Daemon',
      lines: [`${sym.err} daemon ${c.dim(daemonUrl)} ${c.rose(`offline`)}`],
      issues: [{
        id: 'daemon-offline',
        severity: 'critical',
        title: 'daemon offline',
        detail: (err as Error).message,
        hint: 'inicie com: cockpit daemon install (auto-start) ou bun run dev:daemon',
      }],
    }
  }
}

async function checkAgents(): Promise<CheckGroup> {
  const lines: string[] = []
  const issues: Issue[] = []
  try {
    const agents = await api.getAvailableAgents()
    if (agents.length === 0) {
      issues.push({
        id: 'no-cli-agents',
        severity: 'critical',
        title: 'nenhum CLI agent instalado',
        hint: 'instale: claude-code (recomendado), opencode, gemini-cli ou aider',
      })
    } else {
      for (const a of agents) {
        const versionLabel = a.version ? c.gray(` ${a.version.split(' ')[0]}`) : ''
        lines.push(`${sym.ok} ${c.bold(a.name)} ${c.dim(a.path)}${versionLabel}`)
      }
    }
  } catch (err) {
    issues.push({ id: 'agents-list-failed', severity: 'warning', title: 'falha ao listar agents', detail: (err as Error).message })
  }
  return { label: 'CLI Agents', lines, issues }
}

async function checkWorkspaces(): Promise<CheckGroup> {
  const lines: string[] = []
  const issues: Issue[] = []
  try {
    const workspaces = await loadWorkspaces()
    if (workspaces.length === 0) {
      issues.push({
        id: 'no-workspaces',
        severity: 'warning',
        title: 'nenhum workspace criado',
        hint: 'crie via web UI, cockpit ws new <name>, ou cockpit_create_workspace (MCP)',
      })
    } else {
      for (const w of workspaces) {
        lines.push(`${sym.ok} ${c.bold(w.name)} ${c.dim('#' + w.slug)} ${c.gray(w.description || '')}`)
      }
    }
  } catch (err) {
    issues.push({ id: 'workspaces-load-failed', severity: 'warning', title: 'erro ao ler workspaces', detail: (err as Error).message })
  }
  return { label: 'Workspaces', lines, issues }
}

async function checkProjects(): Promise<CheckGroup> {
  const lines: string[] = []
  const issues: Issue[] = []
  try {
    const projects = await loadProjects()
    if (projects.length === 0) {
      issues.push({
        id: 'no-projects',
        severity: 'info',
        title: 'nenhum projeto vinculado',
        hint: 'vincule via web UI > workspace settings > Projetos, ou cockpit_link_project (MCP)',
      })
    } else {
      for (const p of projects) {
        const exists = await pathExists(p.path)
        const led = exists ? sym.ok : sym.err
        const tail = !exists ? c.rose(' [path nao encontrado]') : ''
        lines.push(`${led} ${c.bold(p.name)} ${c.dim(p.path.replace(/^\/Users\/[^/]+\//, '~/'))}${tail}`)
      }
    }
  } catch (err) {
    issues.push({ id: 'projects-load-failed', severity: 'warning', title: 'erro ao ler projetos', detail: (err as Error).message })
  }
  return { label: 'Projetos', lines, issues }
}

async function checkGhCli(): Promise<CheckGroup> {
  const lines: string[] = []
  const issues: Issue[] = []
  try {
    const which = Bun.spawn(['which', 'gh'], { stdout: 'pipe', stderr: 'pipe' })
    const code = await which.exited
    if (code !== 0) {
      issues.push({
        id: 'gh-not-installed',
        severity: 'info',
        title: 'gh CLI nao instalado',
        hint: 'opcional — necessario apenas para auto-PR. brew install gh',
      })
      return { label: 'GitHub CLI', lines, issues }
    }
    const auth = Bun.spawn(['gh', 'auth', 'status'], { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr] = await Promise.all([new Response(auth.stdout).text(), new Response(auth.stderr).text()])
    const exit = await auth.exited
    const combined = stdout + stderr
    if (exit !== 0 && !/Logged in/.test(combined)) {
      issues.push({
        id: 'gh-not-authed',
        severity: 'info',
        title: 'gh CLI instalado mas nao autenticado',
        hint: 'rode: gh auth login (necessario pra auto-PR)',
      })
    } else {
      const m = combined.match(/account ([^\s]+)/) || combined.match(/as ([^\s]+)/) || combined.match(/Logged in to [^\s]+ as ([^\s]+)/)
      lines.push(`${sym.ok} gh CLI ${c.dim('autenticado como ' + (m?.[1] || '?'))}`)
    }
  } catch {
    issues.push({ id: 'gh-check-failed', severity: 'info', title: 'falha ao checar gh CLI' })
  }
  return { label: 'GitHub CLI', lines, issues }
}

async function checkLocks(): Promise<CheckGroup> {
  const issues: Issue[] = []
  try {
    const r = await rawFetch('/maintenance/locks')
    if (r.ok) {
      const data = await r.json() as { locks: Array<{ active: boolean; path: string }> }
      const orphans = data.locks.filter((l) => !l.active)
      if (orphans.length > 0) {
        issues.push({
          id: 'orphan-locks',
          severity: 'warning',
          title: `project locks orfaos: ${c.amber(String(orphans.length))}`,
          detail: orphans.map((l) => l.path).slice(0, 3).join(', ') + (orphans.length > 3 ? ', ...' : ''),
          fix: async () => {
            const f = await rawFetch('/maintenance/reap-locks', { method: 'POST' })
            if (!f.ok) return { ok: false, msg: 'reap-locks endpoint falhou' }
            const d = await f.json() as { cleaned: number }
            return { ok: true, msg: `${d.cleaned} lock(s) limpo(s)` }
          },
        })
      }
    }
  } catch { /* daemon ja foi checado */ }
  return { label: '', lines: [], issues }
}

async function checkZombieSessions(): Promise<CheckGroup> {
  const issues: Issue[] = []
  try {
    const r = await rawFetch('/maintenance/zombie-sessions?staleAfterMin=30')
    if (r.ok) {
      const data = await r.json() as { count: number }
      if (data.count > 0) {
        issues.push({
          id: 'zombie-sessions',
          severity: 'warning',
          title: `sessions zumbis: ${c.amber(String(data.count))}`,
          detail: 'sessions running ha mais de 30min sem update — agent travado ou crashed',
          fix: async () => {
            const f = await rawFetch('/maintenance/reap-sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ staleAfterMin: 30 }),
            })
            if (!f.ok) return { ok: false, msg: 'reap-sessions endpoint falhou' }
            const d = await f.json() as { reaped: number }
            return { ok: true, msg: `${d.reaped} session(s) marcada(s) como error` }
          },
        })
      }
    }
  } catch { /* ok */ }
  return { label: '', lines: [], issues }
}

async function checkBrokenProjects(): Promise<CheckGroup> {
  const issues: Issue[] = []
  try {
    const projects = await loadProjects()
    const broken: typeof projects = []
    for (const p of projects) {
      const ok = await pathExists(p.path)
      if (!ok) broken.push(p)
    }
    if (broken.length > 0) {
      issues.push({
        id: 'broken-project-paths',
        severity: 'warning',
        title: `projetos com path inexistente: ${c.amber(String(broken.length))}`,
        detail: broken.map((p) => p.name + ' → ' + p.path).slice(0, 2).join('; '),
        hint: 'Web UI > workspace settings > Projetos: corrija o path ou desvincule',
      })
    }
  } catch { /* ok */ }
  return { label: '', lines: [], issues }
}

async function checkCockpitInPath(): Promise<CheckGroup> {
  const issues: Issue[] = []
  try {
    const which = Bun.spawn(['which', 'cockpit'], { stdout: 'pipe', stderr: 'pipe' })
    const code = await which.exited
    if (code !== 0) {
      issues.push({
        id: 'cockpit-not-in-path',
        severity: 'info',
        title: 'cockpit nao esta no PATH',
        hint: 'rode: bun run cli:install (na raiz do repo) — adiciona symlink em ~/.local/bin',
      })
    }
  } catch { /* ok */ }
  return { label: '', lines: [], issues }
}

// ─── 5 checks novos (v0.7) ───

async function checkVersionDrift(): Promise<CheckGroup> {
  const lines: string[] = []
  const issues: Issue[] = []
  try {
    const [healthR, infoR] = await Promise.all([
      api.health(),
      rawFetch('/system/info').then((r) => r.ok ? r.json() as Promise<{ daemon_version: string }> : null).catch(() => null),
    ])
    const running = healthR.version
    const expected = infoR?.daemon_version
    if (expected && running !== expected) {
      issues.push({
        id: 'daemon-version-drift',
        severity: 'warning',
        title: `daemon rodando v${running} mas source code e v${expected}`,
        detail: 'voce fez git pull mas esqueceu de reiniciar o daemon',
        hint: 'cockpit daemon restart',
      })
    } else {
      lines.push(`${sym.ok} versao consistente (v${running})`)
    }
  } catch { /* daemon ja foi checado */ }
  return { label: 'Versao', lines, issues }
}

async function checkOrphanWorktrees(): Promise<CheckGroup> {
  const issues: Issue[] = []
  try {
    const projects = await loadProjects()
    let totalOrphans = 0
    let totalSize = 0
    const projectsWithOrphans: Array<{ name: string; count: number; size: number; path: string }> = []
    for (const p of projects) {
      const r = await rawFetch(`/maintenance/worktrees?projectPath=${encodeURIComponent(p.path)}`)
      if (!r.ok) continue
      const data = await r.json() as { worktrees: Array<{ orphan: boolean; sizeBytes?: number }> }
      const orphans = data.worktrees.filter((w) => w.orphan)
      if (orphans.length > 0) {
        const projSize = orphans.reduce((s, w) => s + (w.sizeBytes || 0), 0)
        totalOrphans += orphans.length
        totalSize += projSize
        projectsWithOrphans.push({ name: p.name, count: orphans.length, size: projSize, path: p.path })
      }
    }
    if (totalOrphans > 0) {
      issues.push({
        id: 'orphan-worktrees',
        severity: 'warning',
        title: `worktrees abandonados: ${c.amber(String(totalOrphans))} ${c.dim(`(${formatBytes(totalSize)})`)}`,
        detail: projectsWithOrphans.map((p) => `${p.name}: ${p.count}`).slice(0, 3).join(', '),
        fix: async () => {
          let totalRemoved = 0
          const errors: string[] = []
          for (const p of projectsWithOrphans) {
            const f = await rawFetch('/maintenance/cleanup-worktrees', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectPath: p.path, force: false }),
            })
            if (f.ok) {
              const d = await f.json() as { removed: number; errors?: string[] }
              totalRemoved += d.removed
              if (d.errors?.length) errors.push(...d.errors)
            }
          }
          return { ok: errors.length === 0, msg: `${totalRemoved} worktree(s) removido(s)${errors.length ? ` · ${errors.length} erros` : ''}` }
        },
      })
    }
  } catch { /* ok */ }
  return { label: '', lines: [], issues }
}

async function checkInvalidHooks(): Promise<CheckGroup> {
  const issues: Issue[] = []
  try {
    const workspaces = await loadWorkspaces() as unknown as Array<{ slug: string; name: string; hooks?: Record<string, string> }>
    const broken: Array<{ workspace: string; hook: string; error: string }> = []
    for (const ws of workspaces) {
      if (!ws.hooks) continue
      for (const [hookName, script] of Object.entries(ws.hooks)) {
        if (!script || !script.trim()) continue
        // sh -n parse-only
        const proc = Bun.spawn(['/bin/sh', '-n', '-c', script], { stdout: 'pipe', stderr: 'pipe' })
        const stderr = await new Response(proc.stderr).text()
        const code = await proc.exited
        if (code !== 0) {
          broken.push({ workspace: ws.name, hook: hookName, error: stderr.trim().split('\n')[0].slice(0, 100) })
        }
      }
    }
    if (broken.length > 0) {
      issues.push({
        id: 'invalid-hooks',
        severity: 'warning',
        title: `hooks com sintaxe invalida: ${c.amber(String(broken.length))}`,
        detail: broken.slice(0, 2).map((b) => `${b.workspace}:${b.hook} → ${b.error}`).join('; '),
        hint: 'Web UI > workspace settings > tab Hooks: corrija a sintaxe',
      })
    }
  } catch { /* ok */ }
  return { label: '', lines: [], issues }
}

async function checkMcpConfig(): Promise<CheckGroup> {
  const lines: string[] = []
  const issues: Issue[] = []
  const claudeConfig = join(homedir(), '.claude.json')
  if (!existsSync(claudeConfig)) {
    return { label: 'MCP', lines, issues: [] }  // nao instalado, nao e issue
  }
  try {
    const cfg = JSON.parse(readFileSync(claudeConfig, 'utf-8')) as { mcpServers?: Record<string, { command: string; args?: string[] }> }
    const cockpit = cfg.mcpServers?.cockpit
    if (!cockpit) {
      issues.push({
        id: 'mcp-not-registered',
        severity: 'info',
        title: 'MCP cockpit nao registrado em ~/.claude.json',
        hint: 'rode: bun run mcp:install (na raiz do repo)',
      })
      return { label: 'MCP', lines, issues }
    }
    // Valida que o path do args[1] (entry .ts) ainda existe
    const mcpEntry = cockpit.args?.find((a) => a.endsWith('index.ts') || a.endsWith('cockpit-mcp'))
    if (mcpEntry && !existsSync(mcpEntry)) {
      issues.push({
        id: 'mcp-entry-missing',
        severity: 'warning',
        title: 'MCP cockpit aponta pra path inexistente',
        detail: mcpEntry,
        hint: 'voce moveu o repo? rode: bun run mcp:install (atualiza o path) — ou use --fix',
        // I10 fix — auto-fix: deduzir path correto do CLI rodando atualmente.
        // CLI atual está em <repo>/cli/src/index.ts, MCP entry está em
        // <repo>/mcp/src/index.ts. Resolvemos via import.meta.url.
        fix: async () => {
          try {
            const cliFile = new URL(import.meta.url).pathname
            // cliFile = .../cockpit/cli/src/commands/doctor.ts
            // Subir 3 niveis até <repo>, descer pra mcp/src/index.ts
            const repoRoot = cliFile.replace(/\/cli\/src\/commands\/doctor\.ts$/, '')
            const newEntry = repoRoot + '/mcp/src/index.ts'
            if (!existsSync(newEntry)) {
              return { ok: false, msg: `nao consegui resolver path do MCP (esperava ${newEntry})` }
            }
            // Detecta bun no PATH
            const which = Bun.spawn(['which', 'bun'], { stdout: 'pipe', stderr: 'pipe' })
            const bunPath = (await new Response(which.stdout).text()).trim()
            if (!bunPath) return { ok: false, msg: 'bun nao encontrado no PATH' }

            const newCfg = JSON.parse(readFileSync(claudeConfig, 'utf-8')) as { mcpServers?: Record<string, { command: string; args?: string[] }> }
            if (!newCfg.mcpServers) newCfg.mcpServers = {}
            newCfg.mcpServers.cockpit = {
              command: bunPath,
              args: ['run', newEntry],
            }
            // Atomic write — write-to-temp + rename (mesmo padrao do C3 fix)
            const tmp = `${claudeConfig}.tmp.${process.pid}.${Date.now()}`
            const fs = await import('node:fs')
            fs.writeFileSync(tmp, JSON.stringify(newCfg, null, 2), 'utf-8')
            fs.renameSync(tmp, claudeConfig)
            return { ok: true, msg: `entry MCP atualizado: ${newEntry}` }
          } catch (e) {
            return { ok: false, msg: `auto-fix falhou: ${(e as Error).message}` }
          }
        },
      })
    } else {
      lines.push(`${sym.ok} MCP cockpit registrado ${c.dim('(' + (cockpit.command) + ')')}`)
    }
  } catch (err) {
    issues.push({ id: 'mcp-config-parse-error', severity: 'warning', title: '~/.claude.json invalido', detail: (err as Error).message })
  }
  return { label: 'MCP', lines, issues }
}

async function checkDiskUsage(): Promise<CheckGroup> {
  const lines: string[] = []
  const issues: Issue[] = []
  try {
    const r = await rawFetch('/system/info')
    if (!r.ok) return { label: '', lines, issues }
    const data = await r.json() as {
      cockpit_dir: string
      sizes_bytes: { data: number; tasks: number; logs: number; total: number }
    }
    const total = data.sizes_bytes.total
    const tasks = data.sizes_bytes.tasks
    lines.push(`${sym.ok} ${c.dim(data.cockpit_dir)} ${c.dim('= ' + formatBytes(total))}`)
    lines.push(`  ${c.dim('data:')} ${formatBytes(data.sizes_bytes.data)} ${c.dim('· tasks:')} ${formatBytes(data.sizes_bytes.tasks)} ${c.dim('· logs:')} ${formatBytes(data.sizes_bytes.logs)}`)
    // Alerta acima de 1GB total ou 500MB so em tasks
    if (total > 1_000_000_000) {
      issues.push({
        id: 'cockpit-disk-large',
        severity: 'info',
        title: `~/.cockpit/ ocupa ${formatBytes(total)}`,
        hint: 'considere arquivar workspaces antigos ou limpar manualmente: ~/.cockpit/tasks/',
      })
    } else if (tasks > 500_000_000) {
      issues.push({
        id: 'tasks-disk-large',
        severity: 'info',
        title: `~/.cockpit/tasks/ ocupa ${formatBytes(tasks)}`,
        hint: 'cards antigos acumulam aqui. Limpe manualmente diretorios de cards descartados.',
      })
    }
  } catch { /* ok */ }
  return { label: 'Disco', lines, issues }
}

// ─── Helpers ───

async function pathExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises')
    await stat(path)
    return true
  } catch { return false }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}
