import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdir } from 'node:fs/promises'

const DATA_DIR = join(homedir(), '.cockpit', 'data')

export class DaemonFileStore<T> {
  private filePath: string
  private data: T

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
    } catch {
      this.data = structuredClone(this.defaultValue)
    }
  }

  get(): T {
    return this.data
  }

  async set(value: T): Promise<void> {
    this.data = value
    await Bun.write(this.filePath, JSON.stringify(value))
  }

  async update(fn: (current: T) => T): Promise<void> {
    await this.set(fn(this.data))
  }
}
