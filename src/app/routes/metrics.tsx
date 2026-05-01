import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMetrics } from '@/features/metrics/use-metrics'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import type { CardType, CardPriority } from '@/entities/card/types'
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
import { BarChart3, Clock, Zap, TrendingUp } from 'lucide-react'

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
  const metrics = useMetrics()

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Metricas
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visao geral de produtividade e distribuicao de tarefas
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-4 w-4" />
              Total de Cards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.totalCards}</p>
            <p className="text-xs text-muted-foreground mt-1">em todos os workspaces</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              Concluidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{metrics.totalDone}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.totalCards > 0 ? `${Math.round((metrics.totalDone / metrics.totalCards) * 100)}% do total` : '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Lead Time Medio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const avgAll = metrics.perWorkspace
                .filter((w) => w.avgLeadTimeDays !== null)
                .map((w) => w.avgLeadTimeDays!)
              const avg = avgAll.length > 0 ? (avgAll.reduce((a, b) => a + b, 0) / avgAll.length).toFixed(1) : null
              return (
                <>
                  <p className="text-3xl font-bold">{avg ?? '-'}</p>
                  <p className="text-xs text-muted-foreground mt-1">dias (criacao ate conclusao)</p>
                </>
              )
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Workspaces Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.perWorkspace.filter((w) => w.totalCards > 0).length}</p>
            <p className="text-xs text-muted-foreground mt-1">de {metrics.perWorkspace.length} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Velocity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Velocity Semanal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
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
            </div>
          </CardContent>
        </Card>

        {/* Cards por workspace */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cards por Workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.workspaceBreakdown.filter((w) => w.cards > 0)}
                    dataKey="cards"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props: any) => `${props.name}: ${props.value}`}
                  >
                    {metrics.workspaceBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Por tipo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuicao por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, _name: any, props: any) => [value, CARD_TYPE_CONFIG[props?.payload?.name as CardType]?.label || props?.payload?.name]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {metrics.typeBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={TYPE_COLORS[entry.name] || '#6b7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Por prioridade */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuicao por Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.priorityBreakdown}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props: any) => `${CARD_PRIORITY_CONFIG[props?.name as CardPriority]?.label || props?.name}: ${props?.value}`}
                  >
                    {metrics.priorityBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#6b7280'} />
                    ))}
                  </Pie>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip formatter={(value: any, name: any) => [value, CARD_PRIORITY_CONFIG[name as CardPriority]?.label || name]} />
                  <Legend formatter={(value: string) => CARD_PRIORITY_CONFIG[value as CardPriority]?.label || value} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per workspace detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes por Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.perWorkspace.map((ws) => (
              <div key={ws.workspaceId} className="flex items-center gap-4 py-3 border-b last:border-0">
                <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: ws.workspaceColor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{ws.workspaceName}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{ws.totalCards} cards</Badge>
                    <Badge variant="outline" className="text-[10px] text-green-600">{ws.doneCards} done</Badge>
                    <Badge variant="outline" className="text-[10px] text-blue-600">{ws.inProgressCards} in progress</Badge>
                    {ws.avgLeadTimeDays !== null && (
                      <Badge variant="outline" className="text-[10px]">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {ws.avgLeadTimeDays}d lead time
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(ws.byType).map(([type, count]) => {
                    const config = CARD_TYPE_CONFIG[type as CardType]
                    return (
                      <Badge key={type} variant="secondary" className={`text-[10px] ${config?.bgColor} ${config?.color} border-0`}>
                        {count} {config?.label}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
