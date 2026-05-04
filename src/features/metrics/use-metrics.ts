import { useState, useEffect } from 'react'
import { daemonClient } from '@/shared/lib/daemon-client'

export interface WorkspaceMetrics {
  workspaceId: string
  workspaceName: string
  workspaceColor: string
  totalCards: number
  doneCards: number
  inProgressCards: number
  byType: Record<string, number>
  byPriority: Record<string, number>
}

export interface GlobalMetrics {
  totalCards: number
  totalDone: number
  totalInProgress: number
  avgLeadTimeDays: number | null
  activeWorkspaces: number
  weeklyVelocity: { week: string; count: number }[]
  typeBreakdown: { name: string; count: number }[]
  priorityBreakdown: { name: string; count: number }[]
  workspaceBreakdown: { name: string; cards: number; color: string }[]
  perWorkspace: WorkspaceMetrics[]
  sessions: { total: number; done: number; errors: number }
  discoveryJobs: { total: number; completed: number }
}

const EMPTY: GlobalMetrics = {
  totalCards: 0, totalDone: 0, totalInProgress: 0, avgLeadTimeDays: null,
  activeWorkspaces: 0, weeklyVelocity: [], typeBreakdown: [], priorityBreakdown: [],
  workspaceBreakdown: [], perWorkspace: [],
  sessions: { total: 0, done: 0, errors: 0 },
  discoveryJobs: { total: 0, completed: 0 },
}

export function useMetrics(): { metrics: GlobalMetrics; loading: boolean; error: string | null } {
  const [metrics, setMetrics] = useState<GlobalMetrics>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    daemonClient.getMetrics()
      .then((data) => {
        setMetrics(data as GlobalMetrics)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Daemon offline')
      })
      .finally(() => setLoading(false))
  }, [])

  return { metrics, loading, error }
}
