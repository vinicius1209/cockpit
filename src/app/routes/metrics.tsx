import { useMetrics } from '@/features/metrics/use-metrics'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import type { CardType, CardPriority } from '@/entities/card/types'
import { CockpitPageHeader } from '@/widgets/cockpit-page-header'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Clock, Zap, TrendingUp, Bot, Loader2, AlertCircle, Rocket, Activity } from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  feature: '#3b82f6',
  bugfix: '#ef4444',
  hotfix: '#f97316',
  discovery: '#8b5cf6',
  chore: '#6b7280',
  improvement: '#22c55e',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

export function MetricsPage() {
  const { metrics, loading, error } = useMetrics()

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="relative h-12 w-12">
          <span className="absolute inset-0 rounded-full border border-primary/40" />
          <span className="absolute inset-2 rounded-full border border-primary/30 animate-ping" />
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          ━ CARREGANDO TELEMETRIA ━
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-destructive">━ ERRO DE TELEMETRIA</p>
        <p className="text-xs text-muted-foreground max-w-md">{error}</p>
      </div>
    )
  }

  const successRate = metrics.sessions.total > 0
    ? Math.round((metrics.sessions.done / metrics.sessions.total) * 100)
    : null
  const donePercent = metrics.totalCards > 0
    ? Math.round((metrics.totalDone / metrics.totalCards) * 100)
    : null

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <CockpitPageHeader
        systemLabel="TELEMETRIA · METRICAS"
        title="Metricas"
        subtitle="Visao geral de produtividade e atividade dos agentes"
        stats={[
          { label: 'CARDS', value: String(metrics.totalCards).padStart(3, '0') },
          { label: 'DONE', value: String(metrics.totalDone).padStart(2, '0') },
          { label: 'WIP', value: String(metrics.totalInProgress).padStart(2, '0'), tone: metrics.totalInProgress > 0 ? 'live' : 'default' },
          { label: 'AGENT-RUNS', value: String(metrics.sessions.total).padStart(2, '0') },
        ]}
      />

      {/* ── KPI TILES ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiTile code="TOT" label="Total de cards" value={metrics.totalCards} icon={Zap} color="primary" sub="em todos os workspaces" />
        <KpiTile code="DONE" label="Concluidos" value={metrics.totalDone} icon={TrendingUp} color="emerald" sub={donePercent !== null ? `${donePercent}% do total` : '—'} />
        <KpiTile code="LEAD" label="Lead time medio" value={metrics.avgLeadTimeDays ?? 0} icon={Clock} color="amber" sub="dias (criação → conclusao)" />
        <KpiTile code="RUNS" label="Sessoes de agent" value={metrics.sessions.total} icon={Bot} color="violet" sub={`${metrics.sessions.done} ok · ${metrics.sessions.errors} erro${metrics.sessions.errors !== 1 ? 's' : ''}`} />
      </div>

      {/* ── CHARTS ROW 1 ── */}
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <ChartFrame label="Velocity Semanal" code="VEL/W">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metrics.weeklyVelocity}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="week" className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
              <YAxis allowDecimals={false} className="text-xs" tick={{ fill: 'var(--color-muted-foreground)' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                labelStyle={{ color: 'var(--color-foreground)' }}
              />
              <Bar dataKey="count" name="Concluidos" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame label="Cards por Workspace" code="WS/DIST">
          {metrics.workspaceBreakdown.filter((w) => w.cards > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.workspaceBreakdown.filter((w) => w.cards > 0)}
                  dataKey="cards"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(props) => `${(props as { name: string; value: number }).name}: ${(props as { name: string; value: number }).value}`}
                >
                  {metrics.workspaceBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Nenhum card criado ainda" />
          )}
        </ChartFrame>
      </div>

      {/* ── CHARTS ROW 2 ── */}
      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <ChartFrame label="Distribuicao por Tipo" code="TYPE/DIST">
          {metrics.typeBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.typeBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-muted-foreground)' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fill: 'var(--color-muted-foreground)' }}
                  tickFormatter={(v: string) => CARD_TYPE_CONFIG[v as CardType]?.label || v}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {metrics.typeBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={TYPE_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Sem dados" />
          )}
        </ChartFrame>

        <ChartFrame label="Distribuicao por Prioridade" code="PRIO/DIST">
          {metrics.priorityBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.priorityBreakdown}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(props) => {
                    const p = props as { name: string; value: number }
                    return `${CARD_PRIORITY_CONFIG[p.name as CardPriority]?.label || p.name}: ${p.value}`
                  }}
                >
                  {metrics.priorityBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend formatter={(value: string) => CARD_PRIORITY_CONFIG[value as CardPriority]?.label || value} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Sem dados" />
          )}
        </ChartFrame>
      </div>

      {/* ── PER WORKSPACE + AGENT ACTIVITY ── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-md border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>━ DETALHES POR WORKSPACE</span>
            <span className="ml-auto tabular-nums">{String(metrics.perWorkspace.length).padStart(2, '0')}</span>
          </div>
          <div className="divide-y">
            {metrics.perWorkspace.map((ws, i) => (
              <div key={ws.workspaceId} className="flex items-center gap-3 px-3 py-2.5">
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70 w-6">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-background"
                  style={{ backgroundColor: ws.workspaceColor, boxShadow: `0 0 6px ${ws.workspaceColor}40` }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ws.workspaceName}</p>
                  <div className="flex items-center gap-3 mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span><span className="text-foreground tabular-nums">{ws.totalCards}</span> cards</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span><span className="text-emerald-500 tabular-nums">{ws.doneCards}</span> done</span>
                    <span className="text-muted-foreground/30">·</span>
                    <span><span className="text-amber-500 tabular-nums">{ws.inProgressCards}</span> wip</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {Object.entries(ws.byType).map(([type, count]) => {
                    const config = CARD_TYPE_CONFIG[type as CardType]
                    return (
                      <span
                        key={type}
                        className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0 text-[9px] font-mono uppercase tracking-wider ${config?.bgColor} ${config?.color}`}
                      >
                        <span className="tabular-nums">{count}</span>
                        <span className="opacity-80">{config?.label?.slice(0, 4)}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
            {metrics.perWorkspace.length === 0 && (
              <div className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">
                ━ vazio ━
              </div>
            )}
          </div>
        </div>

        {/* Agent Activity panel */}
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 font-mono text-[10px] uppercase tracking-[0.18em]">
            <Rocket className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">━ AGENT ACTIVITY</span>
          </div>
          <div className="px-3 py-2 space-y-1.5 font-mono text-[11px]">
            <StatLine label="Implementacoes" value={metrics.sessions.total} />
            <StatLine label="Sucesso" value={metrics.sessions.done} valueClass="text-emerald-500" />
            <StatLine label="Erros" value={metrics.sessions.errors} valueClass={metrics.sessions.errors > 0 ? 'text-rose-500' : ''} />
            <StatLine label="Taxa sucesso" value={successRate !== null ? `${successRate}%` : '—'} />
            <StatLine label="Discovery scans" value={metrics.discoveryJobs.total} />
            <div className="border-t my-1.5" />
            <StatLine label="Em progresso" value={metrics.totalInProgress} valueClass={metrics.totalInProgress > 0 ? 'text-amber-500' : ''} />
            <div className="pt-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
              <Activity className="h-2.5 w-2.5" />
              <span>cockpit telemetry</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface KpiTileProps {
  code: string
  label: string
  value: number | string
  icon: typeof Bot
  color: 'primary' | 'amber' | 'violet' | 'emerald'
  sub?: string
}

function KpiTile({ code, label, value, icon: Icon, color, sub }: KpiTileProps) {
  const colorClass = {
    primary: 'text-primary',
    amber: 'text-amber-500',
    violet: 'text-violet-500',
    emerald: 'text-emerald-500',
  }[color]

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{code}</span>
        <Icon className={`h-3 w-3 ml-auto ${colorClass}`} />
      </div>
      <div className={`text-3xl font-bold tabular-nums leading-none ${colorClass}`}>
        {typeof value === 'number' ? String(value).padStart(2, '0') : value}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/70 normal-case tracking-normal font-sans">{sub}</p>}
    </div>
  )
}

function ChartFrame({ label, code, children }: { label: string; code: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className="text-muted-foreground">━ {label}</span>
        <span className="ml-auto text-muted-foreground/60 tracking-[0.14em]">{code}</span>
      </div>
      <div className="p-3 h-64">{children}</div>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">
      ━ {label} ━
    </div>
  )
}

function StatLine({ label, value, valueClass }: { label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${valueClass || 'text-foreground'}`}>{value}</span>
    </div>
  )
}
