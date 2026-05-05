import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { api } from '../api/client'

interface MetricsData {
  totalCards: number
  totalDone: number
  totalInProgress: number
  avgLeadTimeDays: number | null
  weeklyVelocity: Array<{ week: string; count: number }>
  typeBreakdown: Array<{ name: string; count: number }>
  priorityBreakdown: Array<{ name: string; count: number }>
  workspaceBreakdown: Array<{ name: string; cards: number; color: string }>
  perWorkspace: Array<{
    workspaceId: string
    workspaceName: string
    workspaceColor: string
    totalCards: number
    doneCards: number
    inProgressCards: number
    byType: Record<string, number>
  }>
  sessions: { total: number; done: number; errors: number }
  discoveryJobs: { total: number }
}

interface MetricsOpts {
  asJson?: boolean
}

export async function metrics(opts: MetricsOpts = {}): Promise<void> {
  const data = await api.getMetrics() as unknown as MetricsData

  if (opts.asJson) {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  console.log(divider('METRICAS', 'cyan'))
  console.log()

  // KPIs
  console.log(section('KPIs'))
  const successRate = data.sessions.total > 0
    ? Math.round((data.sessions.done / data.sessions.total) * 100)
    : null
  const donePct = data.totalCards > 0
    ? Math.round((data.totalDone / data.totalCards) * 100)
    : null

  console.log(`  ${c.dim('TOTAL')}    ${c.bold(String(data.totalCards).padStart(3, '0'))} cards`)
  console.log(`  ${c.dim('DONE')}     ${c.emerald(String(data.totalDone).padStart(3, '0'))} ${donePct !== null ? c.dim(`(${donePct}%)`) : ''}`)
  console.log(`  ${c.dim('WIP')}      ${c.amber(String(data.totalInProgress).padStart(3, '0'))}`)
  console.log(`  ${c.dim('LEAD')}     ${c.bold(String(data.avgLeadTimeDays ?? '—'))} ${c.dim('dias')}`)
  console.log()

  // Sessions
  console.log(section('Agent Activity'))
  console.log(`  ${c.dim('runs')}        ${c.bold(String(data.sessions.total))}`)
  console.log(`  ${c.dim('sucesso')}     ${c.emerald(String(data.sessions.done))} ${successRate !== null ? c.dim(`(${successRate}%)`) : ''}`)
  console.log(`  ${c.dim('erros')}       ${c.rose(String(data.sessions.errors))}`)
  console.log(`  ${c.dim('discoveries')} ${c.bold(String(data.discoveryJobs.total))}`)
  console.log()

  // Per workspace
  if (data.perWorkspace?.length > 0) {
    console.log(section('Por workspace'))
    for (const ws of data.perWorkspace) {
      const bar = sparkline(ws.totalCards, Math.max(...data.perWorkspace.map((w) => w.totalCards)))
      console.log(`  ${c.bold(ws.workspaceName.padEnd(20))} ${c.dim(String(ws.totalCards).padStart(3) + ' cards')}` +
        ` ${c.emerald(String(ws.doneCards) + ' done')}` +
        ` ${c.amber(String(ws.inProgressCards) + ' wip')}` +
        ` ${bar}`)
    }
    console.log()
  }

  // Velocity
  if (data.weeklyVelocity?.length > 0) {
    console.log(section('Velocity (semanas recentes)'))
    const max = Math.max(1, ...data.weeklyVelocity.map((w) => w.count))
    for (const w of data.weeklyVelocity.slice(-8)) {
      console.log(`  ${c.dim(w.week.padEnd(12))} ${c.bold(String(w.count).padStart(3))} ${c.emerald(bar(w.count, max, 30))}`)
    }
  }
  console.log()
  void sym
}

function bar(value: number, max: number, width: number): string {
  const filled = Math.round((value / max) * width)
  return '█'.repeat(filled) + c.dim('░'.repeat(width - filled))
}

function sparkline(value: number, max: number): string {
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
  const idx = Math.min(chars.length - 1, Math.floor((value / Math.max(1, max)) * chars.length))
  return c.cyan(chars[idx])
}
