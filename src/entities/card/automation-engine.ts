import type { Card, BoardColumn } from './types'
import { useCardStore } from './store'
import { useProjectStore } from './project-store'
import { useDocStore } from '@/entities/docs/store'
import { createDocFromSpec } from '@/features/docs-vault/auto-doc'
import { toast } from 'sonner'
import { DAEMON_URL } from '@/shared/lib/constants'

// Sync column slug → spec_status automatically
const COLUMN_SPEC_STATUS_MAP: Record<string, string> = {
  'spec': 'draft',
  'ready': 'ready',
  'in-progress': 'in_progress',
  'review': 'review',
  'done': 'done',
}

export async function executeColumnAutomations(
  card: Card,
  targetColumn: BoardColumn,
  workspaceId: string,
) {
  const { updateCard } = useCardStore.getState()

  // 1. Auto-sync spec_status with column
  const specStatus = COLUMN_SPEC_STATUS_MAP[targetColumn.slug]
  if (specStatus && card.spec_status !== specStatus) {
    updateCard(card.id, { spec_status: specStatus as Card['spec_status'] })
  }

  // 2. Execute enabled automations
  const automations = targetColumn.automations?.filter((a) => a.enabled) || []

  for (const automation of automations) {
    try {
      switch (automation.action) {
        case 'run_card_discovery': {
          // Guard: skip if card already has discovery content
          if (card.description?.includes('## Card Discovery')) {
            break
          }
          // Guard: skip if already processing
          if (useCardStore.getState().getProcessing(card.id)) {
            break
          }
          await runCardDiscovery(card, workspaceId)
          break
        }

        case 'generate_spec':
          toast.info('Geracao de spec automatica disponivel na aba Spec do card')
          break

        case 'run_implementation': {
          // Guard: skip if already processing
          if (useCardStore.getState().getProcessing(card.id)) {
            break
          }
          // Auto-implement only if assignee is AI Agent
          if (card.assignee === 'ai-agent') {
            toast.info('Implementacao automatica iniciada...', { description: card.title })
            await runAutoImplementation(card, workspaceId)
          } else {
            toast.info(`Card pronto para implementacao`, { description: 'Abra o card e use a aba Implementar' })
          }
          break
        }

        case 'run_review':
          toast.info('Card em review', { description: 'Abra o card para revisao' })
          break

        case 'save_to_vault': {
          // Guard: skip if spec already saved for this card
          if (card.spec_content) {
            const existingDocs = useDocStore.getState().getCardDocs(card.id)
            const alreadySaved = existingDocs.some((d) => d.tags.includes('spec'))
            if (alreadySaved) {
              // Update existing doc instead of creating new one
              const existing = existingDocs.find((d) => d.tags.includes('spec'))
              if (existing && existing.content !== card.spec_content) {
                useDocStore.getState().updateDoc(existing.id, { content: card.spec_content })
                toast.success('Spec atualizada no Docs Vault')
              }
            } else {
              const docId = createDocFromSpec(card, workspaceId)
              if (docId) toast.success('Spec salva automaticamente no Docs Vault')
            }
          }
          break
        }

        case 'notify':
          toast.info(`Card "${card.title}" movido para ${targetColumn.name}`)
          break
      }
    } catch (err) {
      console.error(`[automation] Error executing ${automation.action}:`, err)
    }
  }
}

async function runAutoImplementation(card: Card, workspaceId: string) {
  if (!card.spec_content) {
    toast.warning('Sem spec para implementar')
    return
  }

  const projects = useProjectStore.getState().getWorkspaceProjects(workspaceId)
  const projectPath = card.project_id
    ? projects.find((p) => p.id === card.project_id)?.path
    : projects[0]?.path

  if (!projectPath) {
    toast.warning('Nenhum projeto vinculado ao workspace')
    return
  }

  const { startProcessing, addProcessingChunk, completeProcessing } = useCardStore.getState()
  startProcessing(card.id, 'implementation')

  try {
    const response = await fetch(`${DAEMON_URL}/agents/implement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardTitle: card.title,
        cardType: card.type,
        spec: card.spec_content,
        interviewNotes: card.interview_notes || undefined,
        projectPath,
        createBranch: true,
      }),
    })

    if (!response.ok) {
      toast.error('Implementacao falhou')
      completeProcessing(card.id)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) { completeProcessing(card.id); return }

    const decoder = new TextDecoder()
    let buffer = ''
    let branch: string | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.message) addProcessingChunk(card.id, event.message)
          if (event.text) addProcessingChunk(card.id, event.text)
          if (event.branch) branch = event.branch
          if (event.phase === 'done') {
            // Move to Review
            const columns = useCardStore.getState().getWorkspaceColumns(workspaceId)
            const reviewCol = columns.find((c) => c.slug === 'review')
            if (reviewCol && event.exitCode === 0) {
              useCardStore.getState().moveCard(card.id, reviewCol.id, 0)
              useCardStore.getState().updateCard(card.id, { spec_status: 'review' })
            }
            toast.success('Implementacao concluida', { description: branch ? `Branch: ${branch}` : undefined })
          }
          if (event.phase === 'error') {
            toast.error('Implementacao falhou', { description: event.message })
          }
        } catch { /* skip */ }
      }
    }

    completeProcessing(card.id)
  } catch (err) {
    completeProcessing(card.id)
    toast.error('Implementacao falhou', { description: err instanceof Error ? err.message : 'Erro' })
  }
}

async function runCardDiscovery(card: Card, workspaceId: string) {
  const projects = useProjectStore.getState().getWorkspaceProjects(workspaceId)
  const projectPath = card.project_id
    ? projects.find((p) => p.id === card.project_id)?.path
    : projects[0]?.path

  if (!projectPath) {
    toast.warning('Card Discovery: nenhum projeto vinculado ao workspace')
    return
  }

  toast.info('Card Discovery iniciado...', { description: card.title })

  // Start processing state (live card)
  useCardStore.getState().startProcessing(card.id, 'discovery')

  const systemPrompt = `Voce e um analista de software. Investigue o problema descrito no card no contexto do projeto. Seja conciso e pratico. Use portugues brasileiro.`

  const userMessage = `Analise este card no contexto do projeto:

Titulo: ${card.title}
Tipo: ${card.type}
Prioridade: ${card.priority}
Descricao: ${card.description || 'Sem descricao'}

Investigue:
1. Quais arquivos sao afetados por este problema?
2. Qual o impacto? Quantos componentes/funcoes dependem?
3. Existe codigo relacionado que tambem precisa mudar?
4. Qual a complexidade estimada (baixa/media/alta)?
5. Sugestoes de abordagem para resolver

Retorne em formato markdown estruturado.`

  try {
    const response = await fetch(`${DAEMON_URL}/chat/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        projectPath,
      }),
    })

    if (!response.ok) {
      toast.error('Card Discovery falhou', { description: 'Daemon offline ou erro' })
      useCardStore.getState().completeProcessing(card.id)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) { useCardStore.getState().completeProcessing(card.id); return }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'chunk' && event.text) {
            fullText += event.text + '\n'
            useCardStore.getState().addProcessingChunk(card.id, event.text)
          }
          if (event.type === 'done' && event.fullText) fullText = event.fullText
        } catch { /* skip */ }
      }
    }

    if (fullText.trim()) {
      const { updateCard } = useCardStore.getState()
      const existingDesc = card.description || ''
      updateCard(card.id, {
        description: `${existingDesc}\n\n---\n\n## Card Discovery\n\n${fullText.trim()}`,
      })
      toast.success('Card Discovery concluido', { description: 'Descricao enriquecida com contexto do codigo' })
    }
    useCardStore.getState().completeProcessing(card.id)
  } catch (err) {
    useCardStore.getState().completeProcessing(card.id)
    toast.error('Card Discovery falhou', { description: err instanceof Error ? err.message : 'Erro' })
  }
}
