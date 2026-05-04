import { getDB } from './db'

export function getSecret(provider: string): string | null {
  const row = getDB().query('SELECT key_value FROM secrets WHERE provider = ?').get(provider) as { key_value: string } | null
  if (!row) return null
  return Buffer.from(row.key_value, 'base64').toString('utf-8')
}

export function hasSecret(provider: string): boolean {
  return !!getSecret(provider)
}

export function setSecret(provider: string, value: string): void {
  const encoded = Buffer.from(value, 'utf-8').toString('base64')
  getDB().query('INSERT OR REPLACE INTO secrets (provider, key_value) VALUES (?, ?)').run(provider, encoded)
}

export function removeSecret(provider: string): void {
  getDB().query('DELETE FROM secrets WHERE provider = ?').run(provider)
}

export function listSecrets(): { provider: string; configured: boolean }[] {
  const known = ['claude', 'openai', 'gemini']
  return known.map((p) => ({ provider: p, configured: hasSecret(p) }))
}
