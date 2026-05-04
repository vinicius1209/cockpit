import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, readdir } from 'node:fs/promises'

const TASKS_DIR = join(homedir(), '.cockpit', 'tasks')

export class TaskWorkspace {
  static async ensure(workspaceSlug: string, cardId: string): Promise<string> {
    const taskPath = join(TASKS_DIR, workspaceSlug, cardId)
    await mkdir(taskPath, { recursive: true })
    return taskPath
  }

  static getPath(workspaceSlug: string, cardId: string): string {
    return join(TASKS_DIR, workspaceSlug, cardId)
  }

  // ── Write operations ──

  static async writeSpec(wsSlug: string, cardId: string, content: string): Promise<string> {
    const taskPath = await this.ensure(wsSlug, cardId)
    const filePath = join(taskPath, 'spec.md')
    await Bun.write(filePath, content)
    return filePath
  }

  static async writeDiscovery(wsSlug: string, cardId: string, content: string): Promise<string> {
    const taskPath = await this.ensure(wsSlug, cardId)
    const filePath = join(taskPath, 'discovery.md')
    await Bun.write(filePath, content)
    return filePath
  }

  static async writeInterview(wsSlug: string, cardId: string, notes: string): Promise<string> {
    const taskPath = await this.ensure(wsSlug, cardId)
    const filePath = join(taskPath, 'interview.md')
    await Bun.write(filePath, notes)
    return filePath
  }

  static async appendInterviewMessage(wsSlug: string, cardId: string, msg: Record<string, unknown>): Promise<void> {
    const taskPath = await this.ensure(wsSlug, cardId)
    const filePath = join(taskPath, 'interview.jsonl')
    const line = JSON.stringify(msg) + '\n'
    const file = Bun.file(filePath)
    const existing = await file.exists() ? await file.text() : ''
    await Bun.write(filePath, existing + line)
  }

  static async appendImplementationLog(wsSlug: string, cardId: string, entry: string): Promise<void> {
    const taskPath = await this.ensure(wsSlug, cardId)
    const filePath = join(taskPath, 'implementation.md')
    const file = Bun.file(filePath)
    const existing = await file.exists() ? await file.text() : ''
    const timestamp = new Date().toISOString().slice(11, 19)
    await Bun.write(filePath, existing + `[${timestamp}] ${entry}\n`)
  }

  static async writeMeta(wsSlug: string, cardId: string, meta: Record<string, unknown>): Promise<void> {
    const taskPath = await this.ensure(wsSlug, cardId)
    const filePath = join(taskPath, 'meta.json')
    const file = Bun.file(filePath)
    const existing = await file.exists() ? await file.json().catch(() => ({})) : {}
    await Bun.write(filePath, JSON.stringify({ ...existing, ...meta, updatedAt: new Date().toISOString() }, null, 2))
  }

  // ── Read operations ──

  static async readFile(wsSlug: string, cardId: string, filename: string): Promise<string | null> {
    const filePath = join(TASKS_DIR, wsSlug, cardId, filename)
    const file = Bun.file(filePath)
    if (await file.exists()) {
      return await file.text()
    }
    return null
  }

  static async listFiles(wsSlug: string, cardId: string): Promise<string[]> {
    const taskPath = join(TASKS_DIR, wsSlug, cardId)
    try {
      const entries = await readdir(taskPath)
      return entries
    } catch {
      return []
    }
  }

  // ── Sync (bulk write from frontend) ──

  static async sync(data: {
    workspaceSlug: string
    cardId: string
    title?: string
    type?: string
    priority?: string
    spec?: string
    discoveryOutput?: string
    interviewNotes?: string
    interviewMessages?: Record<string, unknown>[]
    branch?: string
    sessionId?: string
  }): Promise<string> {
    const { workspaceSlug, cardId } = data
    const taskPath = await this.ensure(workspaceSlug, cardId)

    // Write meta
    await this.writeMeta(workspaceSlug, cardId, {
      title: data.title,
      type: data.type,
      priority: data.priority,
      branch: data.branch,
      sessionId: data.sessionId,
    })

    // Write spec
    if (data.spec) {
      await this.writeSpec(workspaceSlug, cardId, data.spec)
    }

    // Write discovery
    if (data.discoveryOutput) {
      await this.writeDiscovery(workspaceSlug, cardId, data.discoveryOutput)
    }

    // Write interview notes
    if (data.interviewNotes) {
      await this.writeInterview(workspaceSlug, cardId, data.interviewNotes)
    }

    // Write interview messages
    if (data.interviewMessages && data.interviewMessages.length > 0) {
      const filePath = join(taskPath, 'interview.jsonl')
      const lines = data.interviewMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      await Bun.write(filePath, lines)
    }

    return taskPath
  }
}
