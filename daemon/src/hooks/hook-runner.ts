// Hook runner — executa shell scripts definidos no workspace em momentos
// do ciclo de implementação. Padrão "hooks" estilo git: usuario pluga
// scripts pra lint, deploy preview, slack notify, etc — sem precisar
// modificar o daemon.
//
// Filosofia:
//  - Scripts rodam em /bin/sh -c <script> com env vars injetadas
//  - Timeout de 60s (hook não deve travar o fluxo)
//  - Stdout/stderr capturado pra log + emit no SSE
//  - before_implement com exit != 0 ABORTA o implement (gate)
//  - Outros hooks (after_*) são informativos — não param o fluxo
//
// Seguranca: hooks rodam com permissoes do daemon (mesma do usuario).
// Não rodar scripts que você não confia.

import { getDB } from '../persistence/db'

export type HookName = 'before_implement' | 'after_implement' | 'after_pr'

export interface HookContext {
  card_id: string
  session_id: string
  workspace_slug: string
  workspace_name: string
  branch?: string
  project_path?: string
  agent?: string
  pr_url?: string
  pr_number?: string
  /** json serializado do summary (filesModified/Created/Deleted). */
  summary_json?: string
}

export interface HookResult {
  ran: boolean
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  /** Se script tinha codigo mas não executou (timeout, erro spawn, etc). */
  error?: string
}

const HOOK_TIMEOUT_MS = 60_000

/**
 * Carrega script do hook a partir do workspace (kv_stores).
 * Retorna string vazia se hook desabilitado/não definido/workspace inexistente.
 */
export function loadHookScript(workspaceSlug: string, hook: HookName): string {
  const db = getDB()
  const row = db.query('SELECT data FROM kv_stores WHERE store_name = ?').get('workspaces') as { data: string } | null
  if (!row) return ''
  try {
    const env = JSON.parse(row.data) as { state?: { workspaces?: Array<{ slug: string; hooks?: Record<string, string> }> } }
    const ws = env.state?.workspaces?.find((w) => w.slug === workspaceSlug)
    return ws?.hooks?.[hook]?.trim() || ''
  } catch {
    return ''
  }
}

/**
 * Executa hook. Sempre retorna um HookResult — não throw. Se script
 * vazio, retorna ran=false sem rodar nada.
 */
export async function runHook(
  hook: HookName,
  ctx: HookContext,
): Promise<HookResult> {
  const script = loadHookScript(ctx.workspace_slug, hook)
  if (!script) {
    return { ran: false, exitCode: 0, stdout: '', stderr: '', durationMs: 0 }
  }

  const startedAt = Date.now()
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    COCKPIT_HOOK: hook,
    COCKPIT_CARD_ID: ctx.card_id,
    COCKPIT_SESSION_ID: ctx.session_id,
    COCKPIT_WORKSPACE_SLUG: ctx.workspace_slug,
    COCKPIT_WORKSPACE_NAME: ctx.workspace_name,
  }
  if (ctx.branch) env.COCKPIT_BRANCH = ctx.branch
  if (ctx.project_path) env.COCKPIT_PROJECT_PATH = ctx.project_path
  if (ctx.agent) env.COCKPIT_AGENT = ctx.agent
  if (ctx.pr_url) env.COCKPIT_PR_URL = ctx.pr_url
  if (ctx.pr_number) env.COCKPIT_PR_NUMBER = ctx.pr_number
  if (ctx.summary_json) env.COCKPIT_SUMMARY = ctx.summary_json

  try {
    const proc = Bun.spawn(['/bin/sh', '-c', script], {
      cwd: ctx.project_path || process.cwd(),
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // Timeout
    const timeoutId = setTimeout(() => {
      try { proc.kill('SIGTERM') } catch { /* ignore */ }
    }, HOOK_TIMEOUT_MS)

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    clearTimeout(timeoutId)

    const durationMs = Date.now() - startedAt
    return {
      ran: true,
      exitCode,
      stdout: stdout.trim().slice(0, 4000),
      stderr: stderr.trim().slice(0, 4000),
      durationMs,
    }
  } catch (err) {
    return {
      ran: true,
      exitCode: -1,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : 'erro desconhecido',
    }
  }
}

/** Formata resultado em uma linha curta pra emitir via SSE. */
export function formatHookResultLine(hook: HookName, result: HookResult): string {
  if (!result.ran) return `[hook ${hook}] (não definido)`
  const status = result.exitCode === 0 ? 'ok' : `falhou (exit=${result.exitCode})`
  const dur = result.durationMs < 1000 ? `${result.durationMs}ms` : `${(result.durationMs / 1000).toFixed(1)}s`
  return `[hook ${hook}] ${status} · ${dur}`
}
