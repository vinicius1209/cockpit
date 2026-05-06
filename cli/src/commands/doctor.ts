import { api, DaemonError, rawFetch } from '../api/client'
import { loadWorkspaces, loadProjects } from '../api/store'
import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { getDaemonUrl } from '../config/daemon'

interface DoctorOpts {
  fix?: boolean
}

export async function doctor(opts: DoctorOpts = {}): Promise<void> {
  console.log(divider('SYSTEM CHECK', 'cyan'))
  console.log()

  // 1. Daemon
  const daemonUrl = getDaemonUrl()
  console.log(section('Daemon'))
  let daemonOk = false
  let daemonVersion: string | null = null
  try {
    const h = await api.health()
    daemonOk = h.status === 'ok'
    daemonVersion = h.version
    line(sym.ok, 'daemon', c.dim(daemonUrl), c.gray(`v${h.version}`))
  } catch (err) {
    line(sym.err, 'daemon', c.dim(daemonUrl), c.rose(`offline (${(err as Error).message})`))
    line(sym.dot, c.dim('  ↳ inicie com: cd daemon && bun run dev'))
  }
  console.log()

  if (!daemonOk) {
    console.log(c.dim('Demais checks foram puladod (precisa do daemon).'))
    process.exit(1)
  }

  // 2. CLI agents instalados
  console.log(section('CLI Agents'))
  try {
    const agents = await api.getAvailableAgents()
    if (agents.length === 0) {
      line(sym.warn, 'nenhum CLI agent encontrado',
        c.dim('instale: claude-code, opencode, gemini-cli ou aider'))
    } else {
      for (const a of agents) {
        const versionLabel = a.version ? c.gray(` ${a.version.split(' ')[0]}`) : ''
        line(sym.ok, c.bold(a.name), c.dim(a.path), versionLabel)
      }
    }
  } catch (err) {
    line(sym.err, 'falha ao listar', c.rose((err as Error).message))
  }
  console.log()

  // 3. Workspaces
  console.log(section('Workspaces'))
  try {
    const workspaces = await loadWorkspaces()
    if (workspaces.length === 0) {
      line(sym.warn, 'nenhum workspace criado',
        c.dim('crie um pelo web UI ou: cockpit ws new <name>'))
    } else {
      for (const w of workspaces) {
        line(sym.ok, c.bold(w.name), c.dim(`#${w.slug}`), c.gray(w.description || ''))
      }
    }
  } catch (err) {
    line(sym.err, 'erro ao ler workspaces', c.rose((err as Error).message))
  }
  console.log()

  // 4. Projetos
  console.log(section('Projetos'))
  try {
    const projects = await loadProjects()
    if (projects.length === 0) {
      line(sym.warn, 'nenhum projeto vinculado',
        c.dim('vincule pelo web UI > workspace settings > Projetos'))
    } else {
      for (const p of projects) {
        const exists = await pathExists(p.path)
        const icon = exists ? sym.ok : sym.err
        const tail = !exists ? c.rose(' [path nao encontrado]') : ''
        line(icon, c.bold(p.name), c.dim(p.path.replace(/^\/Users\/[^/]+\//, '~/')), tail)
      }
    }
  } catch (err) {
    line(sym.err, 'erro ao ler projetos', c.rose((err as Error).message))
  }
  console.log()

  // 5. gh CLI
  console.log(section('GitHub CLI'))
  const ghOk = await checkGhCli()
  if (ghOk.installed && ghOk.authed) {
    line(sym.ok, 'gh CLI', c.dim(`autenticado como ${ghOk.user}`))
  } else if (ghOk.installed) {
    line(sym.warn, 'gh CLI', c.amber('instalado mas nao autenticado'),
      c.dim('rode: gh auth login'))
  } else {
    line(sym.warn, 'gh CLI nao instalado',
      c.dim('opcional — necessario apenas para auto-PR'))
  }
  console.log()

  // 6. Maintenance (locks orfaos + sessions stale + projetos com path inválido)
  console.log(section('Manutencao'))
  const issues: Array<{ kind: string; count: number; fix?: () => Promise<{ ok: boolean; msg: string }> }> = []

  // 6a. Locks orfaos
  try {
    const r = await rawFetch('/maintenance/locks')
    if (r.ok) {
      const data = await r.json() as { locks: Array<{ active: boolean }> }
      const orphans = data.locks.filter((l) => !l.active).length
      if (orphans > 0) {
        issues.push({
          kind: 'project locks orfaos',
          count: orphans,
          fix: async () => {
            const f = await rawFetch('/maintenance/reap-locks', { method: 'POST' })
            if (!f.ok) return { ok: false, msg: 'reap-locks endpoint falhou' }
            const d = await f.json() as { cleaned: number }
            return { ok: true, msg: `${d.cleaned} lock(s) limpo(s)` }
          },
        })
      }
    }
  } catch { /* daemon offline ja foi tratado */ }

  // 6b. Sessions stale (zumbis)
  try {
    const r = await rawFetch('/maintenance/zombie-sessions?staleAfterMin=30')
    if (r.ok) {
      const data = await r.json() as { count: number }
      if (data.count > 0) {
        issues.push({
          kind: 'sessions zumbis (>30min sem update)',
          count: data.count,
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

  // 6c. Projetos com path inválido
  try {
    const projects = await loadProjects()
    const broken: typeof projects = []
    for (const p of projects) {
      const ok = await pathExists(p.path)
      if (!ok) broken.push(p)
    }
    if (broken.length > 0) {
      issues.push({
        kind: 'projetos com path inexistente',
        count: broken.length,
        // Sem fix automatico — usuario tem que decidir (reescrever path ou desvincular)
      })
    }
  } catch { /* ok */ }

  // 6d. cockpit no PATH
  try {
    const which = Bun.spawn(['which', 'cockpit'], { stdout: 'pipe', stderr: 'pipe' })
    const code = await which.exited
    if (code !== 0) {
      issues.push({
        kind: 'cockpit nao esta no PATH',
        count: 1,
        // Fix sugere comando, nao executa (mexer em shell rc nao deve ser auto)
      })
    }
  } catch { /* ok */ }

  if (issues.length === 0) {
    line(sym.ok, 'sem issues detectadas')
  } else {
    for (const issue of issues) {
      line(sym.warn, `${issue.kind}: ${c.amber(String(issue.count))}`)
      if (opts.fix && issue.fix) {
        process.stdout.write(`    ${c.dim('→ corrigindo... ')}`)
        const r = await issue.fix()
        console.log(r.ok ? c.emerald(r.msg) : c.rose(r.msg))
      } else if (issue.fix) {
        line(sym.dot, c.dim('  use --fix para resolver automaticamente'))
      } else {
        line(sym.dot, c.dim('  resolva manualmente (ver hint abaixo)'))
      }
    }
    if (!opts.fix) {
      console.log()
      console.log(c.dim('  ━ resolva tudo de uma vez:'))
      console.log(`    ${c.bold('cockpit doctor --fix')}`)
    }
  }
  console.log()

  // Summary
  console.log(divider('SUMMARY', 'gray'))
  const status = daemonOk ? c.emerald('● operational') : c.rose('● degraded')
  console.log(`  ${status} ${c.dim('— pronto pra orquestrar agents')}`)
  if (daemonVersion) console.log(`  ${c.dim('daemon v' + daemonVersion)}`)
  if (issues.length > 0 && !opts.fix) {
    console.log(`  ${c.amber(String(issues.length) + ' issue' + (issues.length > 1 ? 's' : '') + ' detectada' + (issues.length > 1 ? 's' : ''))}`)
  } else if (issues.length === 0) {
    console.log(`  ${c.emerald('0 issues')}`)
  }
}

function line(...parts: string[]) {
  console.log('  ' + parts.join(' '))
}

async function pathExists(path: string): Promise<boolean> {
  // Bun.file().exists() funciona para arquivos, NAO para diretorios.
  // Usamos stat do node:fs/promises que cobre dir tambem.
  try {
    const { stat } = await import('node:fs/promises')
    await stat(path)
    return true
  } catch { return false }
}

async function checkGhCli(): Promise<{ installed: boolean; authed: boolean; user?: string }> {
  try {
    const which = Bun.spawn(['which', 'gh'], { stdout: 'pipe', stderr: 'pipe' })
    const code = await which.exited
    if (code !== 0) return { installed: false, authed: false }

    const auth = Bun.spawn(['gh', 'auth', 'status'], { stdout: 'pipe', stderr: 'pipe' })
    // gh imprime status em stderr (legacy) OU stdout (versoes novas)
    const [stdout, stderr] = await Promise.all([
      new Response(auth.stdout).text(),
      new Response(auth.stderr).text(),
    ])
    const exit = await auth.exited
    const combined = stdout + stderr

    // Considera autenticado se exit 0 E houver indicacao de login
    if (exit !== 0 && !/Logged in/.test(combined)) {
      return { installed: true, authed: false }
    }

    const m = combined.match(/account ([^\s]+)/) || combined.match(/as ([^\s]+)/) || combined.match(/Logged in to [^\s]+ as ([^\s]+)/)
    return { installed: true, authed: true, user: m?.[1] }
  } catch {
    return { installed: false, authed: false }
  }
}
