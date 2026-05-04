import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir, rename } from 'node:fs/promises'

const DATA_DIR = join(homedir(), '.cockpit', 'data')

export class DaemonFileStore<T> {
  private filePath: string
  private data: T
  private writing = false

  constructor(filename: string, private defaultValue: T) {
    this.filePath = join(DATA_DIR, filename)
    this.data = structuredClone(defaultValue)
  }

  async init(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true })
    try {
      const file = Bun.file(this.filePath)
      if (await file.exists()) {
        this.data = await file.json()
        console.log(`[persistence] Loaded ${this.filePath}`)
      }
    } catch (err) {
      console.error(`[persistence] Corrupt file ${this.filePath}, resetting to default:`, err)
      this.data = structuredClone(this.defaultValue)
    }
  }

  get(): T {
    return this.data
  }

  async set(value: T): Promise<void> {
    this.data = value
    // Atomic write: write to .tmp then rename
    const tmpPath = this.filePath + '.tmp'
    await Bun.write(tmpPath, JSON.stringify(value))
    await rename(tmpPath, this.filePath)
  }

  async update(fn: (current: T) => T): Promise<void> {
    // Serialize updates to prevent concurrent read-modify-write
    if (this.writing) {
      // Wait for current write to finish then retry
      await new Promise((resolve) => setTimeout(resolve, 50))
      return this.update(fn)
    }
    this.writing = true
    try {
      await this.set(fn(this.data))
    } finally {
      this.writing = false
    }
  }
}
