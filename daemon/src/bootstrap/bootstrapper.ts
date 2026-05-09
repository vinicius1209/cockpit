import { writeFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { scanProject } from '../scanner/project-scanner'
import {
  generateAgentsMd,
  generateClaudeMd,
  generateAnnotateCommand,
  generateReviewCommand,
} from './templates'

export interface BootstrapResult {
  project: string
  path: string
  filesCreated: string[]
  filesSkipped: string[]
}

function expandPath(p: string): string {
  if (p.startsWith('~')) return join(homedir(), p.slice(1))
  return p
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

export async function bootstrapProject(projectPath: string, force = false): Promise<BootstrapResult> {
  const absPath = expandPath(projectPath)
  const scan = await scanProject(absPath)

  const created: string[] = []
  const skipped: string[] = []

  // 1. AGENTS.md
  const agentsMdPath = join(absPath, 'AGENTS.md')
  if (force || !await fileExists(agentsMdPath)) {
    await writeFile(agentsMdPath, generateAgentsMd(scan), 'utf-8')
    created.push('AGENTS.md')
  } else {
    skipped.push('AGENTS.md (já existe)')
  }

  // 2. CLAUDE.md
  const claudeMdPath = join(absPath, 'CLAUDE.md')
  if (force || !await fileExists(claudeMdPath)) {
    await writeFile(claudeMdPath, generateClaudeMd(scan), 'utf-8')
    created.push('CLAUDE.md')
  } else {
    skipped.push('CLAUDE.md (já existe)')
  }

  // 3. .claude/commands/
  const claudeDir = join(absPath, '.claude')
  const commandsDir = join(claudeDir, 'commands')

  if (!await dirExists(claudeDir)) {
    await mkdir(claudeDir, { recursive: true })
  }
  if (!await dirExists(commandsDir)) {
    await mkdir(commandsDir, { recursive: true })
  }

  // annotate command
  const annotatePath = join(commandsDir, 'annotate.md')
  if (force || !await fileExists(annotatePath)) {
    await writeFile(annotatePath, generateAnnotateCommand(), 'utf-8')
    created.push('.claude/commands/annotate.md')
  } else {
    skipped.push('.claude/commands/annotate.md (já existe)')
  }

  // review command
  const reviewPath = join(commandsDir, 'review.md')
  if (force || !await fileExists(reviewPath)) {
    await writeFile(reviewPath, generateReviewCommand(), 'utf-8')
    created.push('.claude/commands/review.md')
  } else {
    skipped.push('.claude/commands/review.md (já existe)')
  }

  return {
    project: scan.name,
    path: absPath,
    filesCreated: created,
    filesSkipped: skipped,
  }
}
