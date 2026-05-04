import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, rename, stat } from 'node:fs/promises'

const DATA_DIR = join(homedir(), '.cockpit', 'data')
const DB_PATH = join(DATA_DIR, 'cockpit.db')

let db: Database

export function getDB(): Database {
  return db
}

export async function initDB(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })

  db = new Database(DB_PATH, { create: true })
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec('PRAGMA busy_timeout=5000')

  runMigrations()
  await migrateFromJSON()
  cleanupOldData()

  console.log(`[db] SQLite ready at ${DB_PATH}`)
}

// ── Schema Migrations ──

function runMigrations(): void {
  const version = db.query('PRAGMA user_version').get() as { user_version: number }
  let v = version.user_version

  if (v < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv_stores (
        store_name TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (store_name)
      );

      CREATE TABLE IF NOT EXISTS secrets (
        provider TEXT PRIMARY KEY,
        key_value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scan_history (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        findings_count INTEGER,
        findings TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scans_project ON scan_history(project_path);

      CREATE TABLE IF NOT EXISTS discovery_jobs (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        agent TEXT,
        model TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        progress TEXT,
        result TEXT,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL UNIQUE,
        project_name TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        agent TEXT,
        interval_ms INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        last_result TEXT,
        next_run TEXT
      );

      CREATE TABLE IF NOT EXISTS git_profiles (
        project_path TEXT PRIMARY KEY,
        repo_owner TEXT,
        repo_name TEXT,
        remote_url TEXT,
        base_branch TEXT NOT NULL DEFAULT 'main',
        gh_account TEXT,
        title_convention TEXT DEFAULT 'freeform',
        has_pr_template INTEGER DEFAULT 0,
        pr_template_path TEXT,
        pr_template_content TEXT,
        analyzed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_slug TEXT NOT NULL,
        card_id TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        agent TEXT NOT NULL,
        branch TEXT,
        phase TEXT NOT NULL DEFAULT 'analyzing',
        exit_code INTEGER,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration INTEGER,
        feedback TEXT,
        summary TEXT,
        output TEXT,
        files TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_card ON sessions(workspace_slug, card_id);

      PRAGMA user_version = 1;
    `)
    v = 1
    console.log('[db] Migration v1: schema created')
  }
}

// ── Legacy JSON Import ──

async function migrateFromJSON(): Promise<void> {
  // Import the 5 Zustand data stores
  const stores = ['cockpit-cards', 'cockpit-workspaces', 'cockpit-agents', 'cockpit-docs', 'cockpit-projects']
  const storeNameMap: Record<string, string> = {
    'cockpit-cards': 'cards',
    'cockpit-workspaces': 'workspaces',
    'cockpit-agents': 'agents',
    'cockpit-docs': 'docs',
    'cockpit-projects': 'projects',
  }

  for (const filename of stores) {
    const jsonPath = join(DATA_DIR, `${filename}.json`)
    try {
      const s = await stat(jsonPath)
      if (!s.isFile()) continue

      const file = Bun.file(jsonPath)
      const data = await file.json()
      const storeName = storeNameMap[filename]

      // Check if already imported
      const existing = db.query('SELECT 1 FROM kv_stores WHERE store_name = ?').get(storeName)
      if (existing) continue

      db.query('INSERT INTO kv_stores (store_name, data, updated_at) VALUES (?, ?, ?)').run(
        storeName,
        JSON.stringify(data),
        new Date().toISOString(),
      )

      // Rename legacy file
      await rename(jsonPath, `${jsonPath}.bak`)
      console.log(`[db] Imported ${filename}.json → kv_stores.${storeName}`)
    } catch {
      // File doesn't exist or can't read — skip
    }
  }

  // Import secrets
  const secretsPath = join(homedir(), '.cockpit', 'secrets.json')
  try {
    const s = await stat(secretsPath)
    if (s.isFile()) {
      const existingSecret = db.query('SELECT 1 FROM secrets LIMIT 1').get()
      if (!existingSecret) {
        const file = Bun.file(secretsPath)
        const data = await file.json() as Record<string, string>
        const insert = db.prepare('INSERT OR IGNORE INTO secrets (provider, key_value) VALUES (?, ?)')
        for (const [provider, value] of Object.entries(data)) {
          insert.run(provider, value)
        }
        await rename(secretsPath, `${secretsPath}.bak`)
        console.log(`[db] Imported secrets.json → secrets table`)
      }
    }
  } catch { /* skip */ }

  // Import scan history
  await importJsonStore('scan-history.json', (data) => {
    const insert = db.prepare(`INSERT OR IGNORE INTO scan_history (id, project_path, scanned_at, findings_count, findings, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    for (const [projectPath, scans] of Object.entries(data as Record<string, Array<Record<string, unknown>>>)) {
      for (const scan of scans) {
        insert.run(
          scan.id as string,
          projectPath,
          scan.scannedAt as string || new Date().toISOString(),
          scan.findingsCount as number || 0,
          JSON.stringify(scan.findings || []),
          scan.scannedAt as string || new Date().toISOString(),
        )
      }
    }
  })

  // Import jobs
  await importJsonStore('jobs.json', (data) => {
    const insert = db.prepare(`INSERT OR IGNORE INTO discovery_jobs (id, project_path, agent, model, status, created_at, completed_at, progress, result, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const job of Object.values(data as Record<string, Record<string, unknown>>)) {
      insert.run(
        job.id as string, job.projectPath as string, job.agent as string || null,
        job.model as string || null, job.status as string, job.createdAt as string,
        job.completedAt as string || null, JSON.stringify(job.progress || []),
        JSON.stringify(job.result || null), job.error as string || null,
      )
    }
  })

  // Import scheduled jobs
  await importJsonStore('scheduled-jobs.json', (data) => {
    const insert = db.prepare(`INSERT OR IGNORE INTO scheduled_jobs (id, project_path, project_name, workspace_id, agent, interval_ms, enabled, last_run, last_result, next_run) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const job of Object.values(data as Record<string, Record<string, unknown>>)) {
      insert.run(
        job.id as string, job.projectPath as string, job.projectName as string,
        job.workspaceId as string, job.agent as string || null,
        job.intervalMs as number, job.enabled ? 1 : 0,
        job.lastRun as string || null, JSON.stringify(job.lastResult || null),
        job.nextRun as string || null,
      )
    }
  })

  // Import git profiles
  await importJsonStore('git-profiles.json', (data) => {
    const insert = db.prepare(`INSERT OR IGNORE INTO git_profiles (project_path, repo_owner, repo_name, remote_url, base_branch, gh_account, title_convention, has_pr_template, pr_template_path, pr_template_content, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const p of Object.values(data as Record<string, Record<string, unknown>>)) {
      insert.run(
        p.projectPath as string, p.repoOwner as string, p.repoName as string,
        p.remoteUrl as string, p.baseBranch as string || 'main', p.ghAccount as string,
        p.titleConvention as string || 'freeform', p.hasPrTemplate ? 1 : 0,
        p.prTemplatePath as string || null, p.prTemplateContent as string || null,
        p.analyzedAt as string || null,
      )
    }
  })
}

async function importJsonStore(filename: string, importFn: (data: unknown) => void): Promise<void> {
  const jsonPath = join(DATA_DIR, filename)
  try {
    const s = await stat(jsonPath)
    if (!s.isFile()) return

    const file = Bun.file(jsonPath)
    const data = await file.json()
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      importFn(data)
      await rename(jsonPath, `${jsonPath}.bak`)
      console.log(`[db] Imported ${filename}`)
    }
  } catch { /* skip */ }
}

// ── Cleanup old data ──

function cleanupOldData(): void {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Delete completed/failed jobs older than 30 days
  const jobResult = db.query(`DELETE FROM discovery_jobs WHERE completed_at IS NOT NULL AND completed_at < ?`).run(thirtyDaysAgo)
  if (jobResult.changes > 0) console.log(`[db] Cleaned up ${jobResult.changes} old discovery jobs`)

  // Delete scan history older than 30 days
  const scanResult = db.query(`DELETE FROM scan_history WHERE created_at < ?`).run(thirtyDaysAgo)
  if (scanResult.changes > 0) console.log(`[db] Cleaned up ${scanResult.changes} old scan history entries`)

  // Delete completed sessions older than 30 days (keep recent for history)
  const sessionResult = db.query(`DELETE FROM sessions WHERE completed_at IS NOT NULL AND completed_at < ?`).run(thirtyDaysAgo)
  if (sessionResult.changes > 0) console.log(`[db] Cleaned up ${sessionResult.changes} old sessions`)
}
