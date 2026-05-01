import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir } from 'node:fs/promises'

const SECRETS_PATH = join(homedir(), '.cockpit', 'secrets.json')

let secrets: Record<string, string> = {}

export async function initSecrets(): Promise<void> {
  await mkdir(join(homedir(), '.cockpit'), { recursive: true })
  try {
    const file = Bun.file(SECRETS_PATH)
    if (await file.exists()) {
      const data = await file.json()
      // Decode base64 values
      for (const [key, val] of Object.entries(data)) {
        secrets[key] = Buffer.from(val as string, 'base64').toString('utf-8')
      }
      console.log(`[secrets] Loaded ${Object.keys(secrets).length} keys`)
    }
  } catch {
    secrets = {}
  }
}

export function getSecret(provider: string): string | null {
  return secrets[provider] || null
}

export function hasSecret(provider: string): boolean {
  return !!secrets[provider]
}

export async function setSecret(provider: string, value: string): Promise<void> {
  secrets[provider] = value
  await saveSecrets()
}

export async function removeSecret(provider: string): Promise<void> {
  delete secrets[provider]
  await saveSecrets()
}

export function listSecrets(): { provider: string; configured: boolean }[] {
  const known = ['claude', 'openai', 'gemini']
  return known.map((p) => ({ provider: p, configured: hasSecret(p) }))
}

async function saveSecrets(): Promise<void> {
  const encoded: Record<string, string> = {}
  for (const [key, val] of Object.entries(secrets)) {
    encoded[key] = Buffer.from(val, 'utf-8').toString('base64')
  }
  await Bun.write(SECRETS_PATH, JSON.stringify(encoded, null, 2))
}
