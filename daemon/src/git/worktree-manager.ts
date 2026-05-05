// F9-B — git worktree por session pra isolamento real entre implementations.
//
// Cada session que pediu `isolation=worktree` ganha um worktree separado em
//   <projectPath>.cockpit-worktrees/<sessionId>/
// Isso significa filesystem isolado: dois agents podem rodar em branches
// diferentes do mesmo repo sem stomping. Cleanup pos-execucao (sucesso ou
// erro) remove o worktree. Crashes deixam orfaos que sao limpos no boot.
//
// Custo conhecido (vs lock):
//  - disco: full checkout por session
//  - node_modules: nao compartilhado por padrao (cada worktree precisa de install)
//  - portas: dev servers conflitam entre worktrees do mesmo projeto
//
// Por isso e opt-in (lock continua sendo o default sensato).

import { join, dirname, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, rm, readdir } from 'node:fs/promises'

interface RunResult { ok: boolean; stdout: string; stderr: string }

async function runGit(args: string[], cwd: string): Promise<RunResult> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }
}

export interface WorktreeInfo {
  path: string
  branch: string
  sessionId: string
}

/**
 * Diretorio raiz onde os worktrees vao morar. Fica IRMAO do projeto
 * (nao dentro), pra nao virar um path nested git esquisito.
 *
 *  /Users/x/portfolio          ← projectPath
 *  /Users/x/portfolio.cockpit-worktrees/  ← raiz
 *  /Users/x/portfolio.cockpit-worktrees/<sessionId>/  ← worktree de uma session
 */
export function worktreeRoot(projectPath: string): string {
  const parent = dirname(projectPath)
  const name = basename(projectPath)
  return join(parent, `${name}.cockpit-worktrees`)
}

export function worktreePath(projectPath: string, sessionId: string): string {
  return join(worktreeRoot(projectPath), sessionId)
}

/**
 * Cria um worktree pra uma session. Branch ja deve estar criada (ou eh criada
 * a partir da base se nao existir). Retorna o path do worktree.
 *
 * Throws se: projectPath nao eh git, branch nao pode ser criada, worktree
 * existente colide.
 */
export async function createWorktree(
  projectPath: string,
  sessionId: string,
  branch: string,
  baseBranch?: string,
): Promise<WorktreeInfo> {
  // 1. Garante que e repo git
  const isGit = await runGit(['rev-parse', '--is-inside-work-tree'], projectPath)
  if (!isGit.ok) {
    throw new Error(`projeto nao eh git: ${projectPath}`)
  }

  // 2. Garante diretorio raiz dos worktrees
  const root = worktreeRoot(projectPath)
  if (!existsSync(root)) await mkdir(root, { recursive: true })

  const wtPath = worktreePath(projectPath, sessionId)
  if (existsSync(wtPath)) {
    // Reaproveita se ja existe (resume cenario raro). Caller deve garantir
    // que a session-id ainda esta ativa.
    return { path: wtPath, branch, sessionId }
  }

  // 3. Branch existe?
  const branchCheck = await runGit(['rev-parse', '--verify', `refs/heads/${branch}`], projectPath)

  // 4. git worktree add
  // Se branch existe → 'git worktree add <path> <branch>'
  // Se nao existe   → 'git worktree add -b <branch> <path> <baseBranch?>'
  let result: RunResult
  if (branchCheck.ok) {
    result = await runGit(['worktree', 'add', wtPath, branch], projectPath)
  } else {
    const args = ['worktree', 'add', '-b', branch, wtPath]
    if (baseBranch) args.push(baseBranch)
    result = await runGit(args, projectPath)
  }

  if (!result.ok) {
    throw new Error(`git worktree add falhou: ${result.stderr || result.stdout}`)
  }

  return { path: wtPath, branch, sessionId }
}

/**
 * Remove um worktree apos uso. Idempotente — nao falha se ja foi removido.
 * Se forceRemove, descarta dirty changes (uncommitted edits perdidos).
 *
 * IMPORTANTE: branch criada pelo worktree NAO e deletada — o PR ainda pode
 * estar aberto e merge pendente.
 */
export async function removeWorktree(
  projectPath: string,
  sessionId: string,
  opts: { forceRemove?: boolean } = {},
): Promise<void> {
  const wtPath = worktreePath(projectPath, sessionId)
  if (!existsSync(wtPath)) return

  const args = ['worktree', 'remove']
  if (opts.forceRemove) args.push('--force')
  args.push(wtPath)

  const result = await runGit(args, projectPath)
  if (!result.ok) {
    // Fallback: deletar manualmente + git worktree prune
    if (result.stderr.includes('contains modified') || result.stderr.includes('locked')) {
      console.warn(`[worktree] ${sessionId} dirty, mantido em disco para inspecao: ${wtPath}`)
      return
    }
    // Try manual cleanup
    try {
      await rm(wtPath, { recursive: true, force: true })
      await runGit(['worktree', 'prune'], projectPath)
    } catch (err) {
      console.warn(`[worktree] cleanup manual falhou em ${wtPath}:`, err)
    }
  }
}

/**
 * Lista worktrees existentes do Cockpit num projeto. Usa 'git worktree list'
 * filtrando por path dentro de worktreeRoot.
 */
export async function listCockpitWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
  const result = await runGit(['worktree', 'list', '--porcelain'], projectPath)
  if (!result.ok) return []

  const root = worktreeRoot(projectPath)
  const out: WorktreeInfo[] = []
  let current: Partial<WorktreeInfo> = {}

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      // Push previous if applicable
      if (current.path && current.branch) {
        if (current.path.startsWith(root)) {
          out.push({
            path: current.path,
            branch: current.branch,
            sessionId: basename(current.path),
          })
        }
      }
      current = { path: line.slice(9).trim() }
    } else if (line.startsWith('branch ')) {
      // git output: 'branch refs/heads/feat/xxx'
      const ref = line.slice(7).trim()
      current.branch = ref.replace(/^refs\/heads\//, '')
    }
  }
  // Last entry
  if (current.path && current.branch && current.path.startsWith(root)) {
    out.push({
      path: current.path,
      branch: current.branch,
      sessionId: basename(current.path),
    })
  }

  return out
}

/**
 * Cleanup de worktrees abandonados — diretorios em worktreeRoot cujas
 * sessions ja terminaram (ou nem existem mais). Roda no boot e via reaper.
 *
 * Recebe activeSessionIds: Set das sessions ainda em execucao. Tudo fora
 * dessa lista vira candidato a remocao.
 */
export async function cleanupAbandonedWorktrees(
  projectPath: string,
  activeSessionIds: Set<string>,
): Promise<number> {
  const root = worktreeRoot(projectPath)
  if (!existsSync(root)) return 0

  let cleaned = 0
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return 0
  }

  for (const sessionId of entries) {
    if (activeSessionIds.has(sessionId)) continue
    try {
      await removeWorktree(projectPath, sessionId, { forceRemove: false })
      cleaned++
    } catch (err) {
      console.warn(`[worktree] abandoned cleanup falhou ${sessionId}:`, err)
    }
  }

  return cleaned
}
