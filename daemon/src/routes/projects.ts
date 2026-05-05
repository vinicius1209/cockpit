import { jsonResponse } from '../http'
import { scanProject } from '../scanner/project-scanner'
import { bootstrapProject } from '../bootstrap/bootstrapper'
import { validateProjectPath } from '../validation'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

export async function handleProjectRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // POST /projects/scan — scan a project
  if (path === '/projects/scan' && req.method === 'POST') {
    const body = await req.json() as { path: string }
    const validPath = validateProjectPath(body.path || '')
    if (!validPath) {
      return jsonResponse({ error: 'Invalid or missing "path"' }, 400)
    }

    try {
      const result = await scanProject(validPath)
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ error: `Scan failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  // POST /projects/bootstrap — auto-generate agent configs
  if (path === '/projects/bootstrap' && req.method === 'POST') {
    const body = await req.json() as { path: string; force?: boolean }
    const validBootstrapPath = validateProjectPath(body.path || '')
    if (!validBootstrapPath) {
      return jsonResponse({ error: 'Invalid or missing "path"' }, 400)
    }

    try {
      const result = await bootstrapProject(validBootstrapPath, body.force)
      return jsonResponse(result)
    } catch (err) {
      return jsonResponse({ error: `Bootstrap failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  // POST /projects/sync-config — N7 — exports agent configs to <project>/.cockpit/config.json
  // so the team sharing the repo gets the same agents.
  if (path === '/projects/sync-config' && req.method === 'POST') {
    const body = await req.json() as {
      path: string
      agents: Array<{
        name: string
        role: string
        provider: string
        model: string
        temperature: number
        max_tokens: number
        system_prompt: string
        enabled: boolean
      }>
      workspaceName?: string
    }

    const validPath = validateProjectPath(body.path || '')
    if (!validPath) {
      return jsonResponse({ error: 'Invalid or missing "path"' }, 400)
    }
    if (!Array.isArray(body.agents)) {
      return jsonResponse({ error: 'Missing or invalid "agents"' }, 400)
    }

    try {
      const cockpitDir = join(validPath, '.cockpit')
      await mkdir(cockpitDir, { recursive: true })

      const config = {
        $schema: 'https://github.com/anthropics/cockpit/schema/v1',
        version: 1,
        workspace: body.workspaceName || null,
        synced_at: new Date().toISOString(),
        agents: body.agents,
      }

      await Bun.write(join(cockpitDir, 'config.json'), JSON.stringify(config, null, 2))

      // Add .cockpit/ to .gitignore if not present (selective: keep config.json tracked)
      const gitignorePath = join(validPath, '.gitignore')
      const gitignoreFile = Bun.file(gitignorePath)
      if (await gitignoreFile.exists()) {
        const content = await gitignoreFile.text()
        if (!content.includes('.cockpit/task')) {
          await Bun.write(
            gitignorePath,
            content.trimEnd() + '\n\n# Cockpit — keep config.json tracked, ignore task workspace\n.cockpit/task/\n.cockpit/tasks/\n',
          )
        }
      }

      return jsonResponse({
        ok: true,
        configPath: join(cockpitDir, 'config.json'),
        agentsExported: body.agents.length,
        syncedAt: config.synced_at,
      })
    } catch (err) {
      return jsonResponse({ error: `Sync failed: ${err instanceof Error ? err.message : 'Unknown'}` }, 500)
    }
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
