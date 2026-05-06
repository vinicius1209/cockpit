import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'

const HOME = homedir()
const ALLOWED_STORE_NAMES = ['cards', 'workspaces', 'agents', 'docs', 'projects']

/**
 * Validate and sanitize a slug (workspace slug, card ID, etc).
 * Rejects path traversal attempts and special characters.
 */
export function sanitizeSlug(value: string): string | null {
  if (!value || typeof value !== 'string') return null
  if (value.includes('..') || value.includes('/') || value.includes('\\')) return null
  if (value.includes('\0')) return null
  // Allow alphanumeric, hyphens, underscores, dots
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) return null
  if (value.length > 200) return null
  return value
}

/**
 * Validate a project path. Must:
 * - Be absolute
 * - Resolve to under $HOME
 * - Not contain null bytes
 * - Actually exist on disk (optional check)
 */
export function validateProjectPath(path: string): string | null {
  if (!path || typeof path !== 'string') return null
  if (path.includes('\0')) return null

  // Expand ~ to home dir
  const expanded = path.startsWith('~') ? path.replace('~', HOME) : path
  const resolved = resolve(expanded)

  // Must be under home directory
  if (!resolved.startsWith(HOME)) return null

  // Must not be home directory itself
  if (resolved === HOME) return null

  return resolved
}

/**
 * Validate project path AND check it exists on disk.
 */
export async function validateProjectPathExists(path: string): Promise<string | null> {
  const validated = validateProjectPath(path)
  if (!validated) return null

  try {
    const s = await stat(validated)
    if (!s.isDirectory()) return null
    return validated
  } catch {
    return null
  }
}

/**
 * Validate a filename for task workspace file reads.
 * No path traversal, no slashes, common extensions only.
 */
export function sanitizeFilename(name: string): string | null {
  if (!name || typeof name !== 'string') return null
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return null
  if (name.includes('\0')) return null
  if (name.length > 100) return null
  // Allow alphanumeric, hyphens, underscores, dots
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null
  return name
}

/**
 * Validate a session id — formato gerado por createSession e demais fontes.
 * Pattern: 'session-<digits>-<base36>' ou 'sess-<digits>-<base36>'.
 * Rejeita qualquer coisa com slash, dot, espaco, ou control char.
 *
 * Critico em paths que usam sessionId pra construir caminho de filesystem
 * (ex: cleanup-worktrees faz `rm -rf <root>/<sessionId>` — sessionId
 * malicioso permitiria path traversal).
 */
export function validateSessionId(id: string): string | null {
  if (!id || typeof id !== 'string') return null
  if (id.length > 128) return null
  // Apenas alfanumericos e hifens. Cobre 'session-<ts>-<rand>' e variantes.
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null
  return id
}

/**
 * Validate a data store name against whitelist.
 */
export function validateStoreName(name: string): string | null {
  if (!name || typeof name !== 'string') return null
  if (!ALLOWED_STORE_NAMES.includes(name)) return null
  return name
}

/**
 * Validate a gh username (alphanumeric + hyphens).
 */
export function sanitizeGhUser(user: string): string | null {
  if (!user || typeof user !== 'string') return null
  if (!/^[a-zA-Z0-9-]+$/.test(user)) return null
  if (user.length > 39) return null // GitHub max username length
  return user
}

/**
 * Validate a positive number within range.
 */
export function validatePositiveNumber(value: unknown, min = 0.1, max = 10000): number | null {
  const num = Number(value)
  if (isNaN(num) || num < min || num > max) return null
  return num
}
