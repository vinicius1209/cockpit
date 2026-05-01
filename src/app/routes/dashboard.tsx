import { useWorkspaceStore } from '@/entities/workspace/store'
import { useCardStore } from '@/entities/card/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CARD_TYPE_CONFIG } from '@/shared/lib/constants'
import type { CardType } from '@/entities/card/types'

export function DashboardPage() {
  const { workspaces } = useWorkspaceStore()
  const { cards } = useCardStore()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visao geral dos workspaces e tarefas
        </p>
      </div>

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
  )
}
