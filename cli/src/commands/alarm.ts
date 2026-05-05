import { loadAll } from '../api/store'
import { resolveCard, shortId } from '../api/resolve'
import { c, sym } from '../ui/colors'
import { divider } from '../ui/box'
import { api } from '../api/client'
import { getSSE } from '../api/sse'

interface AlarmOpts {
  all?: boolean
  silent?: boolean   // no sound
  sound?: string     // sound name (macOS: Glass/Ping/Pop/Submarine/...)
  action?: 'spec' | 'implementation' | 'discovery' | 'chat'
}

interface NotificationPayload {
  title: string
  body: string
  sound?: string  // sound name; ignored if alarm --silent
  subtitle?: string
}

// Cross-platform desktop notification.
//
//  macOS  → osascript (built-in, no deps)
//  Linux  → notify-send (libnotify) if available
//  Other  → terminal bell + stdout banner (fallback)
//
// Returns true if a real OS-level notification was emitted.
export async function notify(payload: NotificationPayload, opts: { silent?: boolean } = {}): Promise<boolean> {
  const platform = process.platform

  if (platform === 'darwin') {
    return notifyMac(payload, opts)
  }
  if (platform === 'linux') {
    return notifyLinux(payload, opts)
  }
  // Windows / others — terminal bell only
  process.stdout.write('\x07')
  return false
}

async function notifyMac(p: NotificationPayload, opts: { silent?: boolean }): Promise<boolean> {
  // osascript display notification "..." with title "..." [sound name "..."]
  // Aspas e backslashes precisam escape antes de irem pro AppleScript.
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const parts = [
    `display notification "${esc(p.body)}"`,
    `with title "${esc(p.title)}"`,
  ]
  if (p.subtitle) parts.push(`subtitle "${esc(p.subtitle)}"`)
  if (!opts.silent && p.sound) parts.push(`sound name "${esc(p.sound)}"`)
  const script = parts.join(' ')

  const proc = Bun.spawn(['osascript', '-e', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const code = await proc.exited
  return code === 0
}

async function notifyLinux(p: NotificationPayload, opts: { silent?: boolean }): Promise<boolean> {
  const which = Bun.spawn(['which', 'notify-send'], { stdout: 'pipe', stderr: 'pipe' })
  if ((await which.exited) !== 0) return false
  const args = ['notify-send', '--app-name=cockpit', p.title, p.body]
  if (opts.silent) args.push('--hint=string:suppress-sound:true')
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  return code === 0
}

// ── Command ──

export async function alarm(ref: string | undefined, opts: AlarmOpts = {}): Promise<void> {
  if (opts.all) {
    return alarmAll(opts)
  }
  if (!ref) {
    console.error(c.rose('✕ uso: cockpit alarm <id> [--silent]') + '\n  ou: cockpit alarm --all  (todas sessions running)')
    process.exit(1)
  }
  return alarmOne(ref, opts)
}

async function alarmOne(ref: string, opts: AlarmOpts): Promise<void> {
  const { workspaces, cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card nao encontrado: ') + ref)
    process.exit(1)
  }
  const ws = workspaces.find((w) => w.id === card.workspace_id)
  if (!ws) { console.error(c.rose('✕ workspace nao encontrado')); process.exit(1) }

  const r = await api.getLatestSession(ws.slug, card.id, opts.action)
  const session = r.session
  if (!session) {
    console.error(c.rose('✕ nenhuma session encontrada para #' + shortId(card.id)))
    process.exit(1)
  }
  if (session.completedAt || session.phase === 'done' || session.phase === 'error') {
    // Ja terminou — notifica agora mesmo
    const ok = session.phase !== 'error'
    await notifyTerminal({ card: shortId(card.id), title: card.title, action: session.action, ok, exitCode: session.exitCode || 0, error: session.error || undefined }, opts)
    console.log(c.dim(`  session ja havia terminado · ${ok ? 'done' : 'error'}`))
    return
  }

  console.log(divider(`ALARM · #${shortId(card.id)}`, 'amber'))
  console.log(`  ${c.bold(card.title)}`)
  console.log(`  ${c.dim('action:')} ${session.action} ${c.dim('· phase:')} ${session.phase}`)
  console.log(`  ${c.dim('aguardando termino — Ctrl+C aborta o alarm (session segue)')}`)
  console.log()

  await waitAndNotify(session.id, { card: shortId(card.id), title: card.title, action: session.action }, opts)
}

async function alarmAll(opts: AlarmOpts): Promise<void> {
  const { workspaces, cards } = await loadAll()
  const titleByCardId = new Map<string, string>()
  for (const card of cards) titleByCardId.set(card.id, card.title)

  const r = await api.listRunningSessions()
  const sessions = r.sessions.filter((s) => !s.completedAt && s.phase !== 'done' && s.phase !== 'error')

  if (sessions.length === 0) {
    console.log(c.dim('  nenhuma session rodando agora — nada pra alarmar'))
    return
  }

  console.log(divider(`ALARM · ALL · ${sessions.length} session${sessions.length > 1 ? 's' : ''}`, 'amber'))
  console.log()
  for (const s of sessions) {
    const wsName = workspaces.find((w) => w.slug === s.workspaceSlug)?.name || s.workspaceSlug
    console.log(`  ${sym.warn} #${shortId(s.cardId)} ${c.dim(`· ${s.action} · ${wsName}`)} ${c.dim(titleByCardId.get(s.cardId)?.slice(0, 40) || '')}`)
  }
  console.log()
  console.log(c.dim('  notifica conforme cada uma terminar — Ctrl+C aborta sem matar sessions'))
  console.log()

  const promises = sessions.map((s) =>
    waitAndNotify(s.id, {
      card: shortId(s.cardId),
      title: titleByCardId.get(s.cardId) || '(sem titulo)',
      action: s.action,
    }, opts).catch((err) => {
      console.error(c.rose(`✕ alarm para #${shortId(s.cardId)} falhou: ${(err as Error).message}`))
    })
  )

  await Promise.all(promises)

  // Summary final
  const ok = await notify({
    title: 'Cockpit · todas sessions concluídas',
    body: `${sessions.length} sessions terminaram`,
    sound: opts.sound || 'Glass',
  }, { silent: opts.silent })
  console.log()
  console.log(`  ${ok ? sym.ok : sym.warn} ${ok ? c.emerald('todas notificadas') : c.amber('notify indisponivel — usei stdout')}`)
}

interface SessionContext {
  card: string
  title: string
  action: string
}

async function waitAndNotify(sessionId: string, ctx: SessionContext, opts: AlarmOpts): Promise<void> {
  const ctrl = new AbortController()
  process.on('SIGINT', () => { ctrl.abort(); process.exit(0) })

  let result: { ok: boolean; exitCode: number; error?: string } | null = null

  try {
    await getSSE(
      `/agents/sessions/${sessionId}/stream`,
      (event) => {
        if (event.type === 'done') {
          result = { ok: true, exitCode: (event.exitCode as number) || 0 }
          ctrl.abort()
        }
        if (event.type === 'error') {
          result = { ok: false, exitCode: -1, error: (event.error as string) || 'unknown error' }
          ctrl.abort()
        }
      },
      { signal: ctrl.signal },
    )
  } catch {
    if (!result) return  // interrupted before terminal event
  }

  if (!result) return
  await notifyTerminal({ card: ctx.card, title: ctx.title, action: ctx.action, ok: (result as { ok: boolean }).ok, exitCode: (result as { exitCode: number }).exitCode, error: (result as { error?: string }).error }, opts)
}

async function notifyTerminal(
  meta: { card: string; title: string; action: string; ok: boolean; exitCode: number; error?: string },
  opts: AlarmOpts,
): Promise<void> {
  const verb = meta.ok ? '✓ concluida' : '✕ falhou'
  const subtitle = `#${meta.card} · ${meta.action}`
  const body = meta.ok
    ? meta.title.slice(0, 100)
    : `${meta.title.slice(0, 60)} — ${(meta.error || 'erro').slice(0, 60)}`

  // Sound default: Glass (sucesso), Basso (falha) no macOS
  const defaultSound = meta.ok ? 'Glass' : 'Basso'

  const notified = await notify({
    title: `Cockpit · ${verb}`,
    subtitle,
    body,
    sound: opts.sound || defaultSound,
  }, { silent: opts.silent })

  // Stdout fallback / confirmation
  console.log(
    (meta.ok ? c.emerald('● ') : c.rose('● ')) +
    `#${meta.card} ${verb}` +
    c.dim(` · ${meta.action} · exit=${meta.exitCode}`) +
    (notified ? '' : c.dim(' · notify indisponivel'))
  )
}
