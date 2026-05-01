export const CARD_TYPES = ['feature', 'bugfix', 'hotfix', 'discovery', 'chore', 'improvement'] as const
export type CardType = typeof CARD_TYPES[number]

export const CARD_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type CardPriority = typeof CARD_PRIORITIES[number]

export const SPEC_STATUSES = ['draft', 'ready', 'in_progress', 'review', 'done'] as const
export type SpecStatus = typeof SPEC_STATUSES[number]

export interface BoardColumn {
  id: string
  workspace_id: string
  name: string
  slug: string
  position: number
  color: string | null
  created_at: string
}

export interface Card {
  id: string
  workspace_id: string
  column_id: string
  project_id: string | null
  title: string
  description: string | null
  type: CardType
  priority: CardPriority
  position: number
  assignee: string | null
  due_date: string | null
  spec_status: SpecStatus | null
  labels: CardLabel[]
  created_at: string
  updated_at: string
}

export interface Label {
  id: string
  workspace_id: string
  name: string
  color: string
}

export interface CardLabel {
  card_id: string
  label_id: string
  label?: Label
}

export type CardInsert = Omit<Card, 'id' | 'created_at' | 'updated_at' | 'labels'>
export type CardUpdate = Partial<CardInsert>
