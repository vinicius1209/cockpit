import { useDocStore } from '@/entities/docs/store'
import type { Card } from '@/entities/card/types'

export function createDocFromSpec(card: Card, workspaceId: string): string | null {
  if (!card.spec_content) return null

  const { addDoc } = useDocStore.getState()

  const tags: string[] = [card.type]
  if (card.priority === 'critical' || card.priority === 'high') tags.push(card.priority)
  tags.push('spec')

  return addDoc({
    workspace_id: workspaceId,
    project_id: card.project_id,
    title: `Spec: ${card.title}`,
    content: card.spec_content,
    tags,
    source: 'agent-generated',
    source_ref: null,
    card_id: card.id,
  })
}

export function createDocFromInterview(card: Card, workspaceId: string): string | null {
  if (!card.interview_notes) return null

  const { addDoc } = useDocStore.getState()

  return addDoc({
    workspace_id: workspaceId,
    project_id: card.project_id,
    title: `Entrevista: ${card.title}`,
    content: card.interview_notes,
    tags: [card.type, 'entrevista'],
    source: 'agent-generated',
    source_ref: null,
    card_id: card.id,
  })
}
