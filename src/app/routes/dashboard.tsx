import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useCardStore } from '@/entities/card/store'
import { CARD_TYPE_CONFIG } from '@/shared/lib/constants'
import type { CardType } from '@/entities/card/types'
import { CockpitPageHeader } from '@/widgets/cockpit-page-header'
import { Bot, Loader2, Rocket, FileText, Layers, Activity, ArrowRight, BarChart3 } from 'lucide-react'

export function DashboardPage() {
  const navigate = useNavigate()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const cards = useCardStore((s) => s.cards)
  const processingCards = useCardStore((s) => s.processingCards)

  const activeAgents = Object.values(processingCards).filter((p) => p.status === 'running')
  const inProgressCards = cards.filter((c) => c.spec_status === 'in_progress')
  const reviewCards = cards.filter((c) => c.spec_status === 'review')
  const doneCards = cards.filter((c) => c.spec_status === 'done')
  const totalCards = cards.length

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <CockpitPageHeader
        systemLabel="MISSION CONTROL · DASHBOARD"
        title="Dashboard"
        subtitle="Visao geral dos workspaces e tarefas"
        stats={[
          { label: 'WS', value: String(workspaces.length).padStart(2, '0') },
          { label: 'CARDS', value: String(totalCards).padStart(3, '0') },
          { label: 'LIVE', value: String(activeAgents.length).padStart(2, '0'), tone: activeAgents.length > 0 ? 'live' : 'default' },
        ]}
      />

      {/* ── EMPTY STATE: zero cards ── */}
      {totalCards === 0 && (
        <div className="rounded-md border border-dashed bg-muted/10 p-8 text-center space-y-4 mb-6">
          <div className="text-3xl">🛫</div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">Nada decolando ainda</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Crie seu primeiro card num workspace pra comecar.
              Você pode digitar diretamente, ou pedir pro Claude Code via MCP:{' '}
              <code className="font-mono text-foreground/80 text-[11px] bg-background px-1.5 py-0.5 rounded">
                "cria um card pra X no workspace Y"
              </code>
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {workspaces.length > 0 && (
              <button
                className="text-xs rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 transition-opacity"
                onClick={() => navigate(`/workspace/${workspaces[0].id}?new=1`)}
              >
                Novo card em {workspaces[0].name} →
              </button>
            )}
            <button
              className="text-xs rounded-md border bg-background px-3 py-1.5 hover:bg-muted/40 transition-colors font-mono"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            >
              ⌘K abrir busca
            </button>
            <button
              className="text-xs rounded-md border bg-background px-3 py-1.5 hover:bg-muted/40 transition-colors"
              onClick={() => navigate('/settings')}
            >
              Configurar daemon / agents
            </button>
          </div>
        </div>
      )}

      {/* ── KPI HUD ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiTile
          code="TOT"
          label="Total de cards"
          value={totalCards}
          icon={Layers}
          color="primary"
        />
        <KpiTile
          code="WIP"
          label="Em progresso"
          value={inProgressCards.length}
          icon={Rocket}
          color="amber"
        />
        <KpiTile
          code="RVW"
          label="Em review"
          value={reviewCards.length}
          icon={FileText}
          color="violet"
        />
        <KpiTile
          code="DONE"
          label="Concluidos"
          value={doneCards.length}
          icon={Activity}
          color="emerald"
        />
      </div>

      {/* ── LIVE AGENTS ── */}
      {activeAgents.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/30 overflow-hidden bg-amber-500/5">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/30 bg-amber-500/10 font-mono text-[10px] uppercase tracking-[0.18em]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-amber-500 font-semibold">━ AGENTS ATIVOS</span>
            <span className="ml-auto text-amber-500 tabular-nums">{String(activeAgents.length).padStart(2, '0')}</span>
          </div>
          <div className="p-2 space-y-1.5">
            {activeAgents.map((agent) => {
              const card = cards.find((c) => c.id === agent.cardId)
              const ws = workspaces.find((w) => w.id === card?.workspace_id)
              const actionLabel =
                agent.action === 'discovery' ? 'Card Discovery' :
                agent.action === 'spec' ? 'Gerando Spec' :
                agent.action === 'implementation' ? 'Implementando' :
                agent.action
              return (
                <button
                  key={agent.cardId}
                  onClick={() => ws && navigate(`/workspace/${ws.id}`)}
                  className="w-full flex items-center gap-3 rounded-md border border-amber-500/20 bg-background px-3 py-2 text-left hover:border-amber-500/40 transition-colors"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{card?.title || agent.cardId}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {actionLabel} {ws && <span>· ws: {ws.name}</span>}
                    </p>
                  </div>
                  {agent.chunks.length > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {agent.chunks.length} <span className="text-muted-foreground/50">chunks</span>
                    </span>
                  )}
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── WORKSPACES GRID ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <span>━ Workspaces</span>
          <span className="tabular-nums opacity-60">{String(workspaces.length).padStart(2, '0')}</span>
          <button
            onClick={() => navigate('/metrics')}
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <BarChart3 className="h-3 w-3" />
            <span>METRICAS</span>
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workspaces.map((ws, i) => {
            const wsCards = cards.filter((c) => c.workspace_id === ws.id)
            const typeCounts = wsCards.reduce(
              (acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc },
              {} as Record<string, number>,
            )
            const wsActive = activeAgents.some((a) => {
              const card = cards.find((c) => c.id === a.cardId)
              return card?.workspace_id === ws.id
            })
            return (
              <button
                key={ws.id}
                onClick={() => navigate(`/workspace/${ws.id}`)}
                className="group relative flex flex-col items-stretch text-left rounded-md border bg-card overflow-hidden hover:border-primary/40 hover:shadow-[0_0_0_1px_var(--color-primary)]/20 transition-all"
              >
                {/* Accent bar */}
                <span
                  className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-sm"
                  style={{ backgroundColor: ws.color }}
                  aria-hidden
                />

                {/* Header */}
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                  <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full ring-1 ring-background shrink-0"
                    style={{
                      backgroundColor: ws.color,
                      boxShadow: wsActive ? `0 0 8px ${ws.color}` : undefined,
                    }}
                  />
                  <span className="text-sm font-semibold flex-1 truncate">{ws.name}</span>
                  {wsActive && (
                    <span className="font-mono text-[9px] tracking-[0.18em] text-amber-500">LIVE</span>
                  )}
                </div>

                {/* Big counter */}
                <div className="px-3 py-1 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums leading-none">
                    {wsCards.length}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    cards
                  </span>
                </div>

                {/* Type breakdown */}
                <div className="px-3 pb-2.5 pt-1.5 flex flex-wrap gap-1">
                  {Object.entries(typeCounts).slice(0, 4).map(([type, count]) => {
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
                  {Object.keys(typeCounts).length === 0 && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40">
                      ━ vazio ━
                    </span>
                  )}
                </div>
              </button>
            )
          })}

          {/* New workspace tile */}
          <button
            onClick={() => navigate('/workspace/new')}
            className="flex flex-col items-center justify-center rounded-md border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors py-6 gap-1.5"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Novo workspace</span>
          </button>
        </div>
      </div>
    </div>
  )
}

interface KpiTileProps {
  code: string
  label: string
  value: number
  icon: typeof Bot
  color: 'primary' | 'amber' | 'violet' | 'emerald'
}

function KpiTile({ code, label, value, icon: Icon, color }: KpiTileProps) {
  const colorClass = {
    primary: 'text-primary',
    amber: 'text-amber-500',
    violet: 'text-violet-500',
    emerald: 'text-emerald-500',
  }[color]

  return (
    <div className="relative rounded-md border bg-card overflow-hidden p-3">
      {/* Top row: code + icon */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {code}
        </span>
        <Icon className={`h-3 w-3 ml-auto ${colorClass}`} />
      </div>
      {/* Big value */}
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums leading-none ${colorClass}`}>
          {String(value).padStart(2, '0')}
        </span>
      </div>
      {/* Label */}
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
    </div>
  )
}
