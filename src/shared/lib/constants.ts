import type { CardType, CardPriority, ColumnAutomation } from '@/entities/card/types'

export const CARD_TYPE_CONFIG: Record<CardType, { label: string; color: string; bgColor: string }> = {
  feature: { label: 'Feature', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  bugfix: { label: 'Bugfix', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  hotfix: { label: 'Hotfix', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  discovery: { label: 'Discovery', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  chore: { label: 'Chore', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-900/30' },
  improvement: { label: 'Improvement', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
}

export const CARD_PRIORITY_CONFIG: Record<CardPriority, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critico', color: 'text-red-700', bgColor: 'bg-red-200 dark:bg-red-900/50' },
  high: { label: 'Alta', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  medium: { label: 'Media', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  low: { label: 'Baixa', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
}

function auto(action: ColumnAutomation['action'], enabled = false): ColumnAutomation {
  return { id: `auto-${action}`, trigger: 'on_card_enter', action, enabled, config: {} }
}

export const DEFAULT_COLUMNS = [
  { name: 'Inbox', slug: 'inbox', position: 0, color: '#6b7280', automations: [] as ColumnAutomation[] },
  { name: 'Discovery', slug: 'discovery', position: 1, color: '#8b5cf6', automations: [auto('run_card_discovery', true)] },
  { name: 'Spec', slug: 'spec', position: 2, color: '#3b82f6', automations: [auto('generate_spec')] },
  { name: 'Ready', slug: 'ready', position: 3, color: '#06b6d4', automations: [auto('notify', true)] },
  { name: 'In Progress', slug: 'in-progress', position: 4, color: '#f59e0b', automations: [auto('run_implementation', true)] },
  { name: 'Review', slug: 'review', position: 5, color: '#ec4899', automations: [auto('run_review')] },
  { name: 'Done', slug: 'done', position: 6, color: '#10b981', automations: [auto('save_to_vault', true)] },
]
