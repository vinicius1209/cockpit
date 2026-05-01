import { readdir, stat, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

export interface ProjectScanResult {
  path: string
  name: string
  stack: string[]
  git: GitInfo | null
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string>
  agentConfigs: AgentConfigInfo
  structure: string[]
  todos: TodoItem[]
  readme: string | null
}

export interface GitInfo {
  branch: string
  status: string
  lastCommit: string
  uncommittedChanges: number
  remoteUrl: string | null
}

export interface AgentConfigInfo {
  hasClaudeDir: boolean
  hasOpenCodeDir: boolean
  hasAgentsMd: boolean
  agentsMdContent: string | null
  claudeFiles: string[]
  openCodeFiles: string[]
}

export interface TodoItem {
  file: string
  line: number
  text: string
  type: 'TODO' | 'FIXME' | 'HACK' | 'BUG'
}

function expandPath(p: string): string {
  if (p.startsWith('~')) return join(homedir(), p.slice(1))
  return p
}

export async function scanProject(projectPath: string): Promise<ProjectScanResult> {
  const absPath = expandPath(projectPath)
  const name = basename(absPath)

  const [git, pkg, agentConfigs, structure, todos, readme] = await Promise.all([
    scanGit(absPath),
    readPackageJson(absPath),
    scanAgentConfigs(absPath),
    scanStructure(absPath),
    scanTodos(absPath),
    readReadme(absPath),
  ])

  const stack = detectStack(pkg?.dependencies || {}, pkg?.devDependencies || {})

  return {
    path: absPath,
    name,
    stack,
    git,
    dependencies: pkg?.dependencies || {},
    devDependencies: pkg?.devDependencies || {},
    scripts: pkg?.scripts || {},
    agentConfigs,
    structure,
    todos,
    readme,
  }
}

async function scanGit(projectPath: string): Promise<GitInfo | null> {
  try {
    const gitDir = await stat(join(projectPath, '.git')).catch(() => null)
    if (!gitDir) return null

    const [branch, statusOut, logOut, remoteOut] = await Promise.all([
      runCmd('git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath),
      runCmd('git', ['status', '--porcelain'], projectPath),
      runCmd('git', ['log', '-1', '--format=%h %s (%cr)'], projectPath),
      runCmd('git', ['remote', 'get-url', 'origin'], projectPath).catch(() => null),
    ])

    const statusLines = statusOut.trim().split('\n').filter(Boolean)

    return {
      branch: branch.trim(),
      status: statusLines.length === 0 ? 'clean' : `${statusLines.length} changes`,
      lastCommit: logOut.trim(),
      uncommittedChanges: statusLines.length,
      remoteUrl: remoteOut?.trim() || null,
    }
  } catch {
    return null
  }
}

async function readPackageJson(projectPath: string) {
  try {
    const content = await readFile(join(projectPath, 'package.json'), 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function scanAgentConfigs(projectPath: string): Promise<AgentConfigInfo> {
  const [claudeDir, openCodeDir, agentsMd] = await Promise.all([
    dirExists(join(projectPath, '.claude')),
    dirExists(join(projectPath, '.opencode')),
    fileExists(join(projectPath, 'AGENTS.md')),
  ])

  const [claudeFiles, openCodeFiles, agentsMdContent] = await Promise.all([
    claudeDir ? listDirRecursive(join(projectPath, '.claude'), projectPath) : Promise.resolve([]),
    openCodeDir ? listDirRecursive(join(projectPath, '.opencode'), projectPath) : Promise.resolve([]),
    agentsMd ? readFile(join(projectPath, 'AGENTS.md'), 'utf-8').catch(() => null) : Promise.resolve(null),
  ])

  return {
    hasClaudeDir: claudeDir,
    hasOpenCodeDir: openCodeDir,
    hasAgentsMd: agentsMd,
    agentsMdContent,
    claudeFiles,
    openCodeFiles,
  }
}

async function scanStructure(projectPath: string, maxDepth = 2): Promise<string[]> {
  const result: string[] = []
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '__pycache__', '.venv'])

  async function walk(dir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const sorted = entries
        .filter((e) => !ignoreDirs.has(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })

      for (const entry of sorted) {
        const isDir = entry.isDirectory()
        result.push(`${prefix}${isDir ? '📁' : '📄'} ${entry.name}`)
        if (isDir) {
          await walk(join(dir, entry.name), depth + 1, prefix + '  ')
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  await walk(projectPath, 0, '')
  return result
}

async function scanTodos(projectPath: string): Promise<TodoItem[]> {
  const todos: TodoItem[] = []
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.py', '.rs', '.go']
  const patterns = ['TODO', 'FIXME', 'HACK', 'BUG'] as const

  async function walkFiles(dir: string, depth: number) {
    if (depth > 4) return
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage'])

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory() && !ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
          await walkFiles(fullPath, depth + 1)
        } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
          try {
            const content = await readFile(fullPath, 'utf-8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              for (const pattern of patterns) {
                // Match only comment-style TODOs: // TODO, /* TODO, # TODO, -- TODO
                const commentRegex = new RegExp(`(?://|/\\*|#|--)\\s*${pattern}[:\\s]`, 'i')
                if (commentRegex.test(line)) {
                  const relativePath = fullPath.replace(projectPath + '/', '')
                  todos.push({
                    file: relativePath,
                    line: i + 1,
                    text: lines[i].trim(),
                    type: pattern,
                  })
                }
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // skip
    }
  }

  await walkFiles(projectPath, 0)
  return todos.slice(0, 100) // limit
}

async function readReadme(projectPath: string): Promise<string | null> {
  for (const name of ['README.md', 'readme.md', 'Readme.md']) {
    try {
      const content = await readFile(join(projectPath, name), 'utf-8')
      return content.slice(0, 2000) // truncate
    } catch {
      continue
    }
  }
  return null
}

function detectStack(deps: Record<string, string>, devDeps: Record<string, string>): string[] {
  const all = { ...deps, ...devDeps }
  const stack: string[] = []

  if (all['react']) stack.push('React')
  if (all['next']) stack.push('Next.js')
  if (all['vue']) stack.push('Vue')
  if (all['nuxt']) stack.push('Nuxt')
  if (all['svelte']) stack.push('Svelte')
  if (all['angular']) stack.push('Angular')
  if (all['typescript']) stack.push('TypeScript')
  if (all['tailwindcss'] || all['@tailwindcss/vite']) stack.push('Tailwind')
  if (all['vite']) stack.push('Vite')
  if (all['@supabase/supabase-js']) stack.push('Supabase')
  if (all['prisma'] || all['@prisma/client']) stack.push('Prisma')
  if (all['express']) stack.push('Express')
  if (all['fastify']) stack.push('Fastify')
  if (all['drizzle-orm']) stack.push('Drizzle')

  return stack
}

async function runCmd(cmd: string, args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn([cmd, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const output = await new Response(proc.stdout).text()
  await proc.exited
  return output
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

async function listDirRecursive(dir: string, basePath: string): Promise<string[]> {
  const result: string[] = []
  async function walk(d: string) {
    try {
      const entries = await readdir(d, { withFileTypes: true })
      for (const entry of entries) {
        const full = join(d, entry.name)
        const relative = full.replace(basePath + '/', '')
        if (entry.isDirectory()) {
          await walk(full)
        } else {
          result.push(relative)
        }
      }
    } catch { /* skip */ }
  }
  await walk(dir)
  return result
}
