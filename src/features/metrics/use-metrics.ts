import { useMemo } from 'react'
import { useCardStore } from '@/entities/card/store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import type { CardType, CardPriority } from '@/entities/card/types'
import { differenceInDays, startOfWeek, format, subWeeks } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export interface WorkspaceMetrics {
  workspaceId: string
  workspaceName: string
  workspaceColor: string
  totalCards: number
  doneCards: number
  inProgressCards: number
  byType: Record<CardType, number>
  byPriority: Record<CardPriority, number>
  avgLeadTimeDays: number | null
  velocityPerWeek: { week: string; count: number }[]
}

export interface GlobalMetrics {
  totalCards: number
  totalDone: number
  workspaceBreakdown: { name: string; cards: number; color: string }[]
  typeBreakdown: { name: string; count: number }[]
  priorityBreakdown: { name: string; count: number }[]
  weeklyVelocity: { week: string; count: number }[]
  perWorkspace: WorkspaceMetrics[]
}

export function useMetrics(): GlobalMetrics {
  const { cards, columns } = useCardStore()
  const { workspaces } = useWorkspaceStore()

  return useMemo(() => {
    const now = new Date()
    const allDoneColumnIds = new Set<string>()

    // Find all "done" columns across workspaces
    for (const [, cols] of Object.entries(columns)) {
      for (const col of cols) {
        if (col.slug === 'done') allDoneColumnIds.add(col.id)
      }
    }

    const allInProgressColumnIds = new Set<string>()
    for (const [, cols] of Object.entries(columns)) {
      for (const col of cols) {
        if (col.slug === 'in-progress') allInProgressColumnIds.add(col.id)
      }
    }

    // Done cards with timestamps
    const doneCards = cards.filter((c) => allDoneColumnIds.has(c.column_id))

    // Weekly velocity (last 8 weeks)
    const weeklyVelocity: { week: string; count: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { locale: ptBR })
      const weekEnd = startOfWeek(subWeeks(now, i - 1), { locale: ptBR })
      const weekLabel = format(weekStart, 'dd/MM', { locale: ptBR })
      const count = doneCards.filter((c) => {
        const updated = new Date(c.updated_at)
        return updated >= weekStart && updated < weekEnd
      }).length
      weeklyVelocity.push({ week: weekLabel, count })
    }

    // Type breakdown
    const typeCount: Record<string, number> = {}
    const priorityCount: Record<string, number> = {}
    for (const card of cards) {
      typeCount[card.type] = (typeCount[card.type] || 0) + 1
      priorityCount[card.priority] = (priorityCount[card.priority] || 0) + 1
    }

    // Per workspace metrics
    const perWorkspace: WorkspaceMetrics[] = workspaces.map((ws) => {
      const wsCards = cards.filter((c) => c.workspace_id === ws.id)
      const wsCols = columns[ws.id] || []
      const doneColId = wsCols.find((c) => c.slug === 'done')?.id
      const inProgressColId = wsCols.find((c) => c.slug === 'in-progress')?.id

      const wsDone = doneColId ? wsCards.filter((c) => c.column_id === doneColId) : []
      const wsInProgress = inProgressColId ? wsCards.filter((c) => c.column_id === inProgressColId) : []

      // Lead time: average days from created_at to updated_at for done cards
      let avgLeadTime: number | null = null
      if (wsDone.length > 0) {
        const totalDays = wsDone.reduce((sum, c) => {
          return sum + differenceInDays(new Date(c.updated_at), new Date(c.created_at))
        }, 0)
        avgLeadTime = Math.round((totalDays / wsDone.length) * 10) / 10
      }

      const byType = {} as Record<CardType, number>
      const byPriority = {} as Record<CardPriority, number>
      for (const c of wsCards) {
        byType[c.type] = (byType[c.type] || 0) + 1
        byPriority[c.priority] = (byPriority[c.priority] || 0) + 1
      }

      // Velocity per week for this workspace
      const wsVelocity: { week: string; count: number }[] = []
      for (let i = 7; i >= 0; i--) {
        const weekStart = startOfWeek(subWeeks(now, i), { locale: ptBR })
        const weekEnd = startOfWeek(subWeeks(now, i - 1), { locale: ptBR })
        const weekLabel = format(weekStart, 'dd/MM', { locale: ptBR })
        const count = wsDone.filter((c) => {
          const updated = new Date(c.updated_at)
          return updated >= weekStart && updated < weekEnd
        }).length
        wsVelocity.push({ week: weekLabel, count })
      }

      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        workspaceColor: ws.color,
        totalCards: wsCards.length,
        doneCards: wsDone.length,
        inProgressCards: wsInProgress.length,
        byType,
        byPriority,
        avgLeadTimeDays: avgLeadTime,
        velocityPerWeek: wsVelocity,
      }
    })

    return {
      totalCards: cards.length,
      totalDone: doneCards.length,
      workspaceBreakdown: workspaces.map((ws) => ({
        name: ws.name,
        cards: cards.filter((c) => c.workspace_id === ws.id).length,
        color: ws.color,
      })),
      typeBreakdown: Object.entries(typeCount).map(([name, count]) => ({ name, count })),
      priorityBreakdown: Object.entries(priorityCount).map(([name, count]) => ({ name, count })),
      weeklyVelocity,
      perWorkspace,
    }
  }, [cards, columns, workspaces])
}
