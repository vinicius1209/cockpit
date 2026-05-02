export const CARD_TYPES = ['feature', 'bugfix', 'hotfix', 'discovery', 'chore', 'improvement'] as const
export type CardType = typeof CARD_TYPES[number]

export const CARD_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type CardPriority = typeof CARD_PRIORITIES[number]

export const SPEC_STATUSES = ['draft', 'ready', 'in_progress', 'review', 'done'] as const
export type SpecStatus = typeof SPEC_STATUSES[number]

export type AutomationTrigger = 'on_card_enter'

export const AUTOMATION_ACTIONS = [
  'run_card_discovery',
  'generate_spec',
  'run_implementation',
  'run_review',
  'save_to_vault',
  'notify',
] as const
export type AutomationAction = typeof AUTOMATION_ACTIONS[number]

export const AUTOMATION_ACTION_LABELS: Record<AutomationAction, string> = {
  run_card_discovery: 'Card Discovery (agent investiga o card)',
  generate_spec: 'Gerar spec automaticamente',
  run_implementation: 'Executar implementacao',
  run_review: 'Executar reviewer',
  save_to_vault: 'Salvar spec no Docs Vault',
  notify: 'Notificar (card movido)',
}

export interface ColumnAutomation {
  id: string
  trigger: AutomationTrigger
  action: AutomationAction
  enabled: boolean
  config?: {
    agent?: string
    model?: string
  }
}

export interface BoardColumn {
  id: string
  workspace_id: string
  name: string
  slug: string
  position: number
  color: string | null
  automations: ColumnAutomation[]
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
  spec_content: string | null
  interview_notes: string | null
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
