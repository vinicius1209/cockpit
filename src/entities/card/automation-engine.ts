import type { Card, BoardColumn } from './types'
import { useCardStore } from './store'
import { useProjectStore } from './project-store'
import { createDocFromSpec } from '@/features/docs-vault/auto-doc'
import { toast } from 'sonner'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL || 'http://localhost:4800'

export async function executeColumnAutomations(
  card: Card,
  targetColumn: BoardColumn,
  workspaceId: string,
) {
  const automations = targetColumn.automations?.filter((a) => a.enabled) || []
  if (automations.length === 0) return

  for (const automation of automations) {
    try {
      switch (automation.action) {
        case 'run_card_discovery':
          await runCardDiscovery(card, workspaceId)
          break
        case 'generate_spec':
          toast.info('Geracao de spec automatica disponivel na aba Spec do card')
          break
        case 'run_implementation':
          toast.info('Implementacao disponivel na aba Implementar do card')
          break
        case 'run_review':
          toast.info('Review disponivel na aba AI Agent do card')
          break
        case 'save_to_vault':
          if (card.spec_content) {
            const docId = createDocFromSpec(card, workspaceId)
            if (docId) toast.success('Spec salva automaticamente no Docs Vault')
          }
          break
        case 'notify':
          toast.info(`Card "${card.title}" movido para ${targetColumn.name}`)
          break
      }
    } catch (err) {
      console.error(`[automation] Error executing ${automation.action}:`, err)
    }
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
      return
    }

    // Read SSE stream and accumulate
    const reader = response.body?.getReader()
    if (!reader) return

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
          if (event.type === 'chunk' && event.text) fullText += event.text + '\n'
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
  } catch (err) {
    toast.error('Card Discovery falhou', { description: err instanceof Error ? err.message : 'Erro' })
  }
}
