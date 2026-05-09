// Spec generation async runner — espelha o fluxo da Web UI mas roda 100%
// no daemon, fire-and-forget. Permite que o MCP (cockpit_spec_gen_async)
// dispare geracao via Claude Code sem precisar abrir Web.
//
// Fluxo:
//  1. Carrega card do kv_stores
//  2. Constroi prompt standard (template embutido + contexto do card)
//  3. Cria session com action='spec'
//  4. Spawna agent CLI (default: claude-code), acumula output
//  5. Ao completar: salva card.spec_content + spec_status='draft' no DB
//  6. Marca session done
//
// Alternativa frontend usa /chat/api (Anthropic direto) quando ha API key
// configurada — aqui usamos sempre CLI agent pra simplicidade. Pode evoluir
// depois pra detectar API key e rotear.

import { executeAgentWithCallbacks, detectInstalledAgents } from '../executor/agent-executor'
import { createSession, updateSession, registerSessionAbort, unregisterSessionAbort } from '../tasks/session-manager'
import { getDB } from '../persistence/db'
import { atomicMutate } from '../persistence/atomic-store'

export interface SpecGenConfig {
  cardId: string
  workspaceSlug: string
  /** Override do agent. Default: primeiro detectado. */
  agent?: string
  /** Override do model (sonnet/haiku/opus etc). */
  model?: string
  /** Override do system prompt. Default: template embutido. */
  systemPrompt?: string
  /** projectPath opcional — passado pro agent CLI como cwd, permitindo
   *  Read/Glob real do codigo durante geracao. */
  projectPath?: string
}

export interface SpecGenResult {
  sessionId: string
}

const DEFAULT_SYSTEM_PROMPT = `Voce e um spec-writer experiente. Seu papel e transformar um card de
trabalho (titulo + descricao + entrevista) em uma especificacao tecnica
clara, acionavel, e bem estruturada em Markdown.

Estrutura padrao da spec:

## Contexto
Por que esta tarefa existe (1-2 paragrafos).

## Objetivo
O que precisa estar feito ao final (criterios de aceite).

## Escopo
- O que esta incluido (lista)
- O que NAO esta incluido (lista)

## Plano tecnico
Decisoes de design, arquivos a tocar, abordagem.

## Riscos / pontos de atencao
Edge cases, possiveis quebras, dependencias.

Regras:
- Use portugues brasileiro
- Seja especifico, nao generico
- Se voce tem acesso ao codigo (cwd), LEIA arquivos relevantes antes de
  inferir. Mencione paths concretos quando relevante.
- Evite cerimonia: ir direto ao ponto`

interface CardRow {
  id: string
  title: string
  type: string
  priority: string
  description: string | null
  interview_notes: string | null
  workspace_id: string
  project_id: string | null
}

function loadCard(cardId: string): CardRow | null {
  const db = getDB()
  const row = db.query('SELECT data FROM kv_stores WHERE store_name = ?').get('cards') as { data: string } | null
  if (!row) return null
  const env = JSON.parse(row.data) as { state?: { cards?: CardRow[] } }
  return env.state?.cards?.find((c) => c.id === cardId) || null
}

function buildUserMessage(card: CardRow): string {
  const parts = [
    `Gere uma spec tecnica para o seguinte card:`,
    ``,
    `## Card`,
    `Titulo: ${card.title}`,
    `Tipo: ${card.type}`,
    `Prioridade: ${card.priority}`,
  ]
  if (card.description?.trim()) {
    parts.push(``, `## Descricao`, card.description.trim())
  }
  if (card.interview_notes?.trim()) {
    parts.push(``, `## Notas da entrevista`, card.interview_notes.trim())
  }
  parts.push(
    ``,
    `Se voce tem acesso ao codigo-fonte (cwd setado), leia arquivos`,
    `relevantes antes de inferir. Use paths concretos quando aplicavel.`,
  )
  return parts.join('\n')
}

function updateCardSpecContent(cardId: string, specContent: string): void {
  // Atomic via SQLite transaction — fix Lost Update C1.
  type CardsEnv = { state?: { cards?: Array<Record<string, unknown>> }; _ts?: number }
  try {
    atomicMutate<CardsEnv>('cards', (env) => {
      if (!env?.state?.cards) return env
      const now = new Date().toISOString()
      let changed = false
      const cards = env.state.cards.map((c) => {
        if (c.id === cardId) {
          changed = true
          return { ...c, spec_content: specContent, spec_status: 'draft', updated_at: now }
        }
        return c
      })
      if (!changed) return env
      return { ...env, state: { ...env.state, cards }, _ts: Date.now() }
    })
  } catch (err) {
    console.warn('[updateCardSpecContent] falhou:', err)
  }
}

/**
 * Dispara geracao de spec em background. Retorna sessionId imediatamente
 * (em ate ~100ms — apenas a criacao da session). O agent continua rodando
 * e o card e atualizado quando completar.
 */
export async function startSpecGenAsync(config: SpecGenConfig): Promise<SpecGenResult> {
  const card = loadCard(config.cardId)
  if (!card) throw new Error(`card not found: ${config.cardId}`)

  // Resolve agent — default: primeiro detectado, com preferencia claude-code
  let agentName = config.agent
  if (!agentName) {
    const installed = await detectInstalledAgents()
    if (installed.length === 0) throw new Error('Nenhum CLI agent instalado. Instale claude-code, opencode, gemini-cli ou aider.')
    const claude = installed.find((a) => a.name === 'claude-code')
    agentName = claude?.name || installed[0].name
  }

  // Cria session sincrono pra retornar id rapido
  const session = await createSession(config.workspaceSlug, config.cardId, {
    agent: agentName,
    branch: null,
    attempt: 1,
    feedback: null,
  })

  // Hack: a session-manager.createSession assume action='implementation'.
  // Atualizamos pra 'spec' antes de retornar.
  await updateSession(config.workspaceSlug, config.cardId, session.id, {
    action: 'spec',
    phase: 'implementing',
  })

  const abortCtrl = new AbortController()
  registerSessionAbort(session.id, () => abortCtrl.abort())

  // Spawn em background (sem await)
  void runSpecGenInBackground(session.id, config, card, agentName, abortCtrl).catch((err) => {
    console.error('[spec-runner] background error:', err)
  })

  return { sessionId: session.id }
}

async function runSpecGenInBackground(
  sessionId: string,
  config: SpecGenConfig,
  card: CardRow,
  agentName: string,
  abortCtrl: AbortController,
): Promise<void> {
  const startedAt = Date.now()
  const userMessage = buildUserMessage(card)
  // I4 fix — append-only systemPrompt. Antes: config.systemPrompt
  // SUBSTITUIA o DEFAULT, permitindo prompt injection se MCP client
  // malicioso passasse "Ignore previous instructions...". Agora: DEFAULT
  // sempre prefixa, custom (se houver) vai como suffix de "## Contexto
  // adicional" — guardrails do DEFAULT permanecem em vigor.
  const customSuffix = config.systemPrompt?.trim()
  const systemPrompt = customSuffix
    ? `${DEFAULT_SYSTEM_PROMPT}\n\n## Contexto adicional do projeto\n${customSuffix}`
    : DEFAULT_SYSTEM_PROMPT
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`

  let allOutput = ''
  // I9 fix — antes usava `allOutput.length % 1000 < chunk.length` que e
  // heuristica fragil: chunk grande pode pular varios "marcos" sem
  // persistir. Agora throttle temporal: persiste se passou >2s desde o
  // ultimo persist E ha conteudo novo. Garante max 1 update/2s e min
  // 1 update por janela ativa de 2s.
  let lastPersistAt = 0
  const PERSIST_THROTTLE_MS = 2000

  try {
    const result = await executeAgentWithCallbacks(
      {
        agent: agentName,
        prompt: fullPrompt,
        projectPath: config.projectPath,
        model: config.model,
      },
      (chunk) => {
        allOutput += chunk
        const now = Date.now()
        if (now - lastPersistAt > PERSIST_THROTTLE_MS) {
          lastPersistAt = now
          updateSession(config.workspaceSlug, config.cardId, sessionId, {
            chunks: [allOutput],
          }).catch(() => {})
        }
      },
      abortCtrl.signal,
    )

    const wasAborted = abortCtrl.signal.aborted
    if (wasAborted) {
      await updateSession(config.workspaceSlug, config.cardId, sessionId, {
        phase: 'error',
        error: 'aborted by user',
        completedAt: new Date().toISOString(),
        duration: Math.round((Date.now() - startedAt) / 1000),
      })
      return
    }

    // Sucesso — salva spec no card + finaliza session
    const finalSpec = allOutput.trim()
    if (finalSpec) {
      updateCardSpecContent(config.cardId, finalSpec)
    }
    await updateSession(config.workspaceSlug, config.cardId, sessionId, {
      phase: 'done',
      exitCode: result.exitCode,
      completedAt: new Date().toISOString(),
      duration: Math.round(result.duration / 1000),
      chunks: [finalSpec],
    })
  } catch (err) {
    await updateSession(config.workspaceSlug, config.cardId, sessionId, {
      phase: 'error',
      error: err instanceof Error ? err.message : 'erro desconhecido',
      completedAt: new Date().toISOString(),
      duration: Math.round((Date.now() - startedAt) / 1000),
    }).catch(() => {})
  } finally {
    unregisterSessionAbort(sessionId)
  }
}
