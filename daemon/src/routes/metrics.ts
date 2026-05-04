import { jsonResponse } from '../http'
import { getDB } from '../persistence/db'

interface KvStoreState {
  state?: {
    cards?: Array<{
      id: string
      workspace_id: string
      column_id: string
      title: string
      type: string
      priority: string
      created_at: string
      updated_at: string
      spec_status: string | null
    }>
    columns?: Record<string, Array<{
      id: string
      workspace_id: string
      slug: string
      name: string
    }>>
  }
}

interface KvWorkspaceState {
  state?: {
    workspaces?: Array<{
      id: string
      name: string
      slug: string
      color: string
    }>
  }
}

export async function handleMetricsRoutes(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  if (path === '/api/metrics' && req.method === 'GET') {
    const db = getDB()

    // Load cards and workspaces from kv_stores (Zustand format)
    const cardsRow = db.query('SELECT data FROM kv_stores WHERE store_name = ?').get('cards') as { data: string } | null
    const wsRow = db.query('SELECT data FROM kv_stores WHERE store_name = ?').get('workspaces') as { data: string } | null

    let cards: KvStoreState['state']['cards'] = []
    let columns: KvStoreState['state']['columns'] = {}
    let workspaces: KvWorkspaceState['state']['workspaces'] = []

    try {
      if (cardsRow) {
        const parsed = JSON.parse(cardsRow.data) as KvStoreState
        cards = parsed.state?.cards || []
        columns = parsed.state?.columns || {}
      }
    } catch { /* invalid json */ }

    try {
      if (wsRow) {
        const parsed = JSON.parse(wsRow.data) as KvWorkspaceState
        workspaces = parsed.state?.workspaces || []
      }
    } catch { /* invalid json */ }

    // Sessions from SQLite directly
    const sessionsCount = (db.query('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count
    const doneSessionsCount = (db.query("SELECT COUNT(*) as count FROM sessions WHERE phase = 'done'").get() as { count: number }).count
    const errorSessionsCount = (db.query("SELECT COUNT(*) as count FROM sessions WHERE phase = 'error'").get() as { count: number }).count

    // Discovery jobs
    const jobsCount = (db.query('SELECT COUNT(*) as count FROM discovery_jobs').get() as { count: number }).count
    const completedJobsCount = (db.query("SELECT COUNT(*) as count FROM discovery_jobs WHERE status = 'completed'").get() as { count: number }).count

    // Find done/in-progress column IDs across all workspaces
    const doneColumnIds = new Set<string>()
    const inProgressColumnIds = new Set<string>()
    for (const cols of Object.values(columns)) {
      for (const col of cols) {
        if (col.slug === 'done') doneColumnIds.add(col.id)
        if (col.slug === 'in-progress') inProgressColumnIds.add(col.id)
      }
    }

    const doneCards = cards.filter((c) => doneColumnIds.has(c.column_id))
    const inProgressCards = cards.filter((c) => inProgressColumnIds.has(c.column_id))

    // Weekly velocity (last 8 weeks) — cards moved to done
    const now = Date.now()
    const weekMs = 7 * 24 * 60 * 60 * 1000
    const weeklyVelocity: { week: string; count: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now - (i + 1) * weekMs)
      const weekEnd = new Date(now - i * weekMs)
      const label = `${String(weekStart.getDate()).padStart(2, '0')}/${String(weekStart.getMonth() + 1).padStart(2, '0')}`
      const count = doneCards.filter((c) => {
        const t = new Date(c.updated_at).getTime()
        return t >= weekStart.getTime() && t < weekEnd.getTime()
      }).length
      weeklyVelocity.push({ week: label, count })
    }

    // Type breakdown
    const typeCount: Record<string, number> = {}
    const priorityCount: Record<string, number> = {}
    for (const card of cards) {
      typeCount[card.type] = (typeCount[card.type] || 0) + 1
      priorityCount[card.priority] = (priorityCount[card.priority] || 0) + 1
    }

    // Lead time (avg days from created_at to updated_at for done cards)
    let avgLeadTimeDays: number | null = null
    if (doneCards.length > 0) {
      const totalMs = doneCards.reduce((sum, c) => {
        return sum + (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime())
      }, 0)
      avgLeadTimeDays = Math.round((totalMs / doneCards.length / (24 * 60 * 60 * 1000)) * 10) / 10
    }

    // Per workspace
    const perWorkspace = workspaces.map((ws) => {
      const wsCards = cards.filter((c) => c.workspace_id === ws.id)
      const wsCols = columns[ws.id] || []
      const doneColId = wsCols.find((c) => c.slug === 'done')?.id
      const ipColId = wsCols.find((c) => c.slug === 'in-progress')?.id

      const wsDone = doneColId ? wsCards.filter((c) => c.column_id === doneColId).length : 0
      const wsInProgress = ipColId ? wsCards.filter((c) => c.column_id === ipColId).length : 0

      const byType: Record<string, number> = {}
      const byPriority: Record<string, number> = {}
      for (const c of wsCards) {
        byType[c.type] = (byType[c.type] || 0) + 1
        byPriority[c.priority] = (byPriority[c.priority] || 0) + 1
      }

      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        workspaceColor: ws.color,
        totalCards: wsCards.length,
        doneCards: wsDone,
        inProgressCards: wsInProgress,
        byType,
        byPriority,
      }
    })

    return jsonResponse({
      totalCards: cards.length,
      totalDone: doneCards.length,
      totalInProgress: inProgressCards.length,
      avgLeadTimeDays,
      activeWorkspaces: workspaces.length,
      weeklyVelocity,
      typeBreakdown: Object.entries(typeCount).map(([name, count]) => ({ name, count })),
      priorityBreakdown: Object.entries(priorityCount).map(([name, count]) => ({ name, count })),
      workspaceBreakdown: workspaces.map((ws) => ({
        name: ws.name,
        cards: cards.filter((c) => c.workspace_id === ws.id).length,
        color: ws.color,
      })),
      perWorkspace,
      // Agent metrics from SQLite
      sessions: { total: sessionsCount, done: doneSessionsCount, errors: errorSessionsCount },
      discoveryJobs: { total: jobsCount, completed: completedJobsCount },
    })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}
