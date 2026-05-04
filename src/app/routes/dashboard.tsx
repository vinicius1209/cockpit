import { useWorkspaceStore } from '@/entities/workspace/store'
import { useCardStore, type ProcessingState } from '@/entities/card/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CARD_TYPE_CONFIG } from '@/shared/lib/constants'
import type { CardType } from '@/entities/card/types'
import { Bot, Loader2, CheckCircle2, AlertCircle, Rocket, GitBranch, FileText } from 'lucide-react'
import { useDaemonStatus } from '@/shared/hooks/use-daemon-status'

export function DashboardPage() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const cards = useCardStore((s) => s.cards)
  const processingCards = useCardStore((s) => s.processingCards)
  const daemonOnline = useDaemonStatus()

  const activeAgents = Object.values(processingCards).filter((p) => p.status === 'running')
  const inProgressCards = cards.filter((c) => c.spec_status === 'in_progress')
  const reviewCards = cards.filter((c) => c.spec_status === 'review')
  const totalCards = cards.length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visao geral dos workspaces e tarefas
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Cards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalCards}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5" /> Em Progresso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-500">{inProgressCards.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Em Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-500">{reviewCards.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" /> Daemon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${daemonOnline ? 'bg-green-500' : daemonOnline === false ? 'bg-red-500' : 'bg-yellow-500'}`} />
              <span className="text-sm font-medium">{daemonOnline ? 'Online' : daemonOnline === false ? 'Offline' : 'Checking...'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Agents */}
      {activeAgents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              Agents Ativos
              <Badge variant="secondary" className="text-[10px]">{activeAgents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeAgents.map((agent) => {
                const card = cards.find((c) => c.id === agent.cardId)
                return (
                  <div key={agent.cardId} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{card?.title || agent.cardId}</p>
                      <p className="text-xs text-muted-foreground">
                        {agent.action === 'discovery' ? 'Card Discovery' :
                         agent.action === 'spec' ? 'Gerando Spec' :
                         agent.action === 'implementation' ? 'Implementando' :
                         agent.action}
                      </p>
                    </div>
                    {agent.chunks.length > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {agent.chunks.length} chunks
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workspace Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Workspaces</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {workspaces.map((ws) => {
            const wsCards = cards.filter((c) => c.workspace_id === ws.id)
            const typeCounts = wsCards.reduce(
              (acc, c) => {
                acc[c.type] = (acc[c.type] || 0) + 1
                return acc
              },
              {} as Record<string, number>,
            )

            return (
              <Card key={ws.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: ws.color }} />
                    {ws.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{wsCards.length}</p>
                  <p className="text-xs text-muted-foreground mb-2">cards ativos</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(typeCounts).map(([type, count]) => {
                      const config = CARD_TYPE_CONFIG[type as CardType]
                      return (
                        <Badge
                          key={type}
                          variant="secondary"
                          className={`text-[10px] ${config?.bgColor} ${config?.color} border-0`}
                        >
                          {count} {config?.label}
                        </Badge>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
