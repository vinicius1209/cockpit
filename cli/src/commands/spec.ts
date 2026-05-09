import { loadAll, updateCard } from '../api/store'
import { resolveCard, shortId } from '../api/resolve'
import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { rawFetch } from '../api/client'
import { postSSE } from '../api/sse'
import { createStreamRenderer, renderChunk, flushOutputBuffer } from '../ui/stream-render'
import { spawn } from 'node:child_process'

const SPEC_TEMPLATE = `## Titulo
{title}

## Contexto
Descreva o contexto do problema ou necessidade.

## Objetivo
O que deve ser alcancado com essa tarefa.

## Requisitos Funcionais
- [ ] RF1:
- [ ] RF2:

## Requisitos Não Funcionais
- [ ] RNF1:

## Criterios de Aceite
- [ ] CA1:

## Plano de Implementação
1.
2.

## Estimativa
`

// ── show: imprime spec completa ──
export async function specShow(ref: string): Promise<void> {
  const { cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }
  if (!card.spec_content?.trim()) {
    console.error(c.amber('⚠ card sem spec'))
    console.log(c.dim('  use: cockpit spec gen ' + shortId(card!.id)))
    console.log(c.dim('  ou:  cockpit spec edit ' + shortId(card!.id)))
    process.exit(0)
  }

  console.log(divider(`SPEC · #${shortId(card!.id)} · ${card.spec_status || 'draft'}`, statusColor(card.spec_status)))
  console.log()
  console.log(c.dim('  ' + card.title))
  console.log()
  // Imprime markdown raw — terminal renderiza headers como bold se quiser
  for (const line of card.spec_content.split('\n')) {
    if (line.startsWith('# ')) {
      console.log(c.bold(c.cyan(line)))
    } else if (line.startsWith('## ')) {
      console.log(c.bold(line))
    } else if (line.startsWith('### ')) {
      console.log(c.dim(c.bold(line)))
    } else if (line.match(/^- \[ \]/)) {
      console.log(c.amber(line))
    } else if (line.match(/^- \[x\]/i)) {
      console.log(c.emerald(line))
    } else {
      console.log(line)
    }
  }
  console.log()
  console.log(c.dim('  ━ ações:'))
  if (card.spec_status === 'draft') {
    console.log(c.dim(`    cockpit spec ready ${shortId(card!.id)}     marca como pronta`))
  }
  console.log(c.dim(`    cockpit spec gen ${shortId(card!.id)}        regerar com AI`))
  console.log(c.dim(`    cockpit spec edit ${shortId(card!.id)}       abrir no $EDITOR`))
  if (card.spec_status === 'ready' || card.spec_status === 'draft') {
    console.log(c.dim(`    cockpit implement ${shortId(card!.id)} --watch  implementar`))
  }
}

// ── gen: dispara geração via daemon ──
interface GenOpts {
  watch?: boolean
}

interface AgentEnvelope {
  state?: { configs?: Record<string, Array<{ name: string; role: string; provider: string; model: string; system_prompt: string; enabled: boolean }>> }
}

export async function specGen(ref: string, opts: GenOpts = {}): Promise<void> {
  const { workspaces, cards, projects } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }
  const ws = workspaces.find((w) => w.id === card!.workspace_id)
  if (!ws) {
    console.error(c.rose('✕ workspace não encontrado'))
    process.exit(1)
  }

  // Pega spec-writer agent
  const agentsRes = await rawFetch('/api/data/agents')
  const env = await agentsRes.json() as AgentEnvelope
  const wsAgents = env.state?.configs?.[ws.id] || []
  const writer = wsAgents.find((a) => a.role === 'spec-writer' && a.enabled)
  if (!writer) {
    console.error(c.rose('✕ workspace não tem spec-writer agent configurado'))
    console.log(c.dim('  configure pelo web UI > workspace settings > Agentes'))
    process.exit(1)
  }

  const project = card.project_id
    ? projects.find((p) => p.id === card.project_id)
    : projects.find((p) => p.workspace_id === ws.id)

  // Header
  console.log(divider(`SPEC GEN · #${shortId(card!.id)}`, 'cyan'))
  console.log(`  ${c.bold(card.title)}`)
  console.log(`  ${c.dim('agente:')} ${writer.name} ${c.dim('· model:')} ${writer.model}`)
  if (project) console.log(`  ${c.dim('proj:')} ${project.name}`)
  console.log()

  if (!opts.watch) {
    console.log(c.dim('  ━ background mode. para tail: ') + c.bold('cockpit watch ' + shortId(card!.id) + ' --action spec'))
  }
  console.log()

  // Build prompt
  const userMessage = `Gere uma spec técnica completa para o seguinte card:

Titulo: ${card.title}
Tipo: ${card.type}
Prioridade: ${card.priority}
Descrição: ${card.description || 'Sem descrição detalhada'}
${card.interview_notes ? `\nNotas da entrevista:\n${card.interview_notes}` : ''}
${project ? `\nProjeto: ${project.name}` : ''}

Se você tem acesso ao codigo-fonte, leia os arquivos mencionados para entender o contexto real antes de gerar a spec.`

  const enrichedSystemPrompt = buildSystemPrompt(writer.system_prompt, card, ws, project)
  const renderer = createStreamRenderer()
  let fullText = ''

  const ctrl = new AbortController()
  process.on('SIGINT', () => {
    ctrl.abort()
    flushOutputBuffer(renderer)
    console.log()
    console.log(c.amber('━ ABORT enviado.'))
    process.exit(130)
  })

  try {
    await postSSE(
      '/chat/run',
      {
        systemPrompt: enrichedSystemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        model: writer.model,
        projectPath: project?.path,
        cardId: card.id,
        workspaceSlug: ws.slug,
        action: 'spec',
      },
      (event) => {
        if (!opts.watch) {
          if (event.type === 'done' || event.type === 'error') {
            handleTerminal(event)
          }
          return
        }

        if (event.type === 'chunk' && typeof event.text === 'string') {
          fullText += event.text
          renderChunk({ kind: 'output', text: event.text, state: renderer })
        }
        if (event.type === 'done' || event.type === 'error') {
          handleTerminal(event)
        }
      },
      { signal: ctrl.signal },
    )
  } catch (err) {
    if (!ctrl.signal.aborted) {
      console.error(c.rose('✕ erro: ') + (err as Error).message)
      process.exit(1)
    }
  }

  flushOutputBuffer(renderer)

  function handleTerminal(event: { type: string; fullText?: string; message?: string }): void {
    flushOutputBuffer(renderer)
    if (event.type === 'done') {
      console.log()
      console.log()
      console.log(divider('SPEC GERADA', 'emerald'))
      console.log(`  ${sym.ok} ${(event.fullText || fullText).length} chars`)
      console.log(c.dim(`  status: draft (use ${c.bold('cockpit spec ready ' + shortId(card!.id))} para aprovar)`))
    }
    if (event.type === 'error') {
      console.log(c.rose('  ✕ ' + (event.message || 'erro desconhecido')))
    }
  }
}

// ── ready: draft → ready ──
export async function specReady(ref: string): Promise<void> {
  const { cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }
  if (!card.spec_content?.trim()) {
    console.error(c.rose('✕ card sem spec — gere uma antes'))
    console.log(c.dim('  use: cockpit spec gen ' + shortId(card!.id)))
    process.exit(1)
  }
  if (card.spec_status === 'ready') {
    console.log(c.dim('spec já esta marcada como ready'))
    return
  }
  await updateCard(card.id, { spec_status: 'ready' })
  console.log(`${c.emerald('✓')} #${shortId(card!.id)} spec aprovada como ${c.bold('Pronta')}`)
  console.log(c.dim(`  use: cockpit implement ${shortId(card!.id)} --watch`))
}

// ── reset: limpa spec ──
export async function specReset(ref: string, force = false): Promise<void> {
  const { cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }
  if (!card.spec_content) {
    console.log(c.dim('spec já esta vazia'))
    return
  }
  if (!force) {
    console.log(c.amber('⚠ vai apagar a spec atual de #' + shortId(card!.id)))
    console.log(c.dim(`  ${card.spec_content.length} chars serao perdidos`))
    console.log(c.dim('  use --force para confirmar'))
    process.exit(0)
  }
  await updateCard(card.id, { spec_content: null, spec_status: null })
  console.log(`${c.emerald('✓')} #${shortId(card!.id)} spec resetada`)
}

// ── edit: abre $EDITOR ──
export async function specEdit(ref: string): Promise<void> {
  const { cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }

  const editor = process.env.EDITOR || process.env.VISUAL || 'vim'
  const tmpFile = `/tmp/cockpit-spec-${shortId(card!.id)}-${Date.now()}.md`

  const initialContent = card.spec_content?.trim()
    ? card.spec_content
    : SPEC_TEMPLATE.replace('{title}', card.title)

  await Bun.write(tmpFile, initialContent)

  console.log(c.dim(`  abrindo no ${editor}…`))
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(editor, [tmpFile], { stdio: 'inherit' })
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`editor exited with code ${code}`))
    })
    proc.on('error', reject)
  })

  const newContent = await Bun.file(tmpFile).text()
  if (newContent === initialContent && !card.spec_content) {
    console.log(c.dim('  template não foi modificado — nada a salvar'))
    return
  }
  if (newContent === card.spec_content) {
    console.log(c.dim('  conteudo idêntico — nada a salvar'))
    return
  }

  await updateCard(card.id, {
    spec_content: newContent,
    spec_status: card.spec_status || 'draft',
  })
  console.log(`${c.emerald('✓')} #${shortId(card!.id)} spec atualizada (${newContent.length} chars)`)
}

// ── save-vault: cria doc no Vault ──
export async function specSaveVault(ref: string): Promise<void> {
  const { workspaces, cards } = await loadAll()
  const card = resolveCard(ref, cards)
  if (!card) {
    console.error(c.rose('✕ card não encontrado: ') + ref)
    process.exit(1)
  }
  if (!card.spec_content?.trim()) {
    console.error(c.rose('✕ card sem spec'))
    process.exit(1)
  }
  const ws = workspaces.find((w) => w.id === card.workspace_id)
  if (!ws) {
    console.error(c.rose('✕ workspace não encontrado'))
    process.exit(1)
  }

  // Le store de docs, adiciona doc novo
  const docsRes = await rawFetch('/api/data/docs')
  const env = await docsRes.json() as { state?: { docs?: Array<Record<string, unknown>> }; version?: number }
  const docs = env.state?.docs || []

  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
  const tags = [card.type]
  if (card.priority === 'critical' || card.priority === 'high') tags.push(card.priority)
  tags.push('spec')

  docs.push({
    id: docId,
    workspace_id: ws.id,
    project_id: card.project_id,
    title: `Spec: ${card.title}`,
    content: card.spec_content,
    tags,
    source: 'agent-generated',
    source_ref: null,
    card_id: card.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Reescreve o store
  const updated = { ...env, state: { ...(env.state || {}), docs }, _ts: Date.now() }
  const writeRes = await rawFetch('/api/data/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  })
  if (!writeRes.ok) {
    console.error(c.rose('✕ falha ao salvar no Vault'))
    process.exit(1)
  }
  console.log(`${c.emerald('✓')} spec de #${shortId(card!.id)} salva no Docs Vault`)
  console.log(c.dim(`  doc id: ${docId}`))
  console.log(c.dim(`  tags: ${tags.join(', ')}`))
}

// ── helpers ──

function statusColor(status: string | null): 'cyan' | 'emerald' | 'amber' | 'rose' | 'gray' {
  if (status === 'done') return 'emerald'
  if (status === 'ready') return 'cyan'
  if (status === 'draft') return 'amber'
  if (status === 'error') return 'rose'
  return 'gray'
}

function buildSystemPrompt(
  base: string,
  card: { title: string; type: string; priority: string; description: string | null; interview_notes: string | null },
  ws: { name: string; slug: string; description: string | null },
  project: { name: string; path: string } | undefined,
): string {
  const parts: string[] = []
  if (base) parts.push(base.trim())

  parts.push(`## Contexto do Workspace
Workspace: ${ws.name}
${ws.description ? `Descrição: ${ws.description}` : ''}`)

  if (project) {
    parts.push(`## Projeto vinculado
- Nome: ${project.name}
- Path: ${project.path}

Você tem acesso ao codigo-fonte deste projeto via filesystem (cwd já apontando
para o path acima). Pode ler arquivos para gerar uma spec mais precisa.`)
  }

  parts.push(`## Card
- Titulo: ${card.title}
- Tipo: ${card.type} · Prioridade: ${card.priority}
${card.description ? '\n### Descrição\n' + card.description : ''}
${card.interview_notes ? '\n### Notas da entrevista\n' + card.interview_notes : ''}`)

  return parts.join('\n\n')
}
