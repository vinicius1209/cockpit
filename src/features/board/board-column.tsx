import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, Zap } from 'lucide-react'
import type { Card, BoardColumn as BoardColumnType } from '@/entities/card/types'
import { BoardCard } from './board-card'

interface BoardColumnProps {
  column: BoardColumnType
  cards: Card[]
  onCardClick: (card: Card) => void
  onAddCard: (columnId: string) => void
  index: number
  totalColumns: number
}

export function BoardColumn({ column, cards, onCardClick, onAddCard, index, totalColumns }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', column },
  })

  const enabledAutomations = column.automations?.filter((a) => a.enabled) ?? []
  const numStr = String(index + 1).padStart(2, '0')
  const totalStr = String(totalColumns).padStart(2, '0')

  return (
    <section
      className={`flex h-full w-72 shrink-0 flex-col rounded-lg border bg-muted/20 transition-colors ${
        isOver ? 'border-primary bg-accent/30' : 'border-border/60'
      }`}
      role="region"
      aria-label={`Coluna ${column.name}`}
    >
      {/* ── Column header — uma linha so com mono prefix + bullet color + name + count ── */}
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70 shrink-0">
          {numStr}/{totalStr}
        </span>
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-background"
          style={{ backgroundColor: column.color ?? '#6b7280', boxShadow: `0 0 8px ${column.color ?? '#6b7280'}40` }}
        />
        <h3 className="text-sm font-semibold flex-1 truncate">{column.name}</h3>
        {enabledAutomations.length > 0 && (
          <span
            className="flex items-center gap-0.5 font-mono text-[10px] text-amber-500/80"
            title={`${enabledAutomations.length} automacao(oes) ativa(s)`}
          >
            <Zap className="h-2.5 w-2.5" fill="currentColor" />
            <span className="tabular-nums">{enabledAutomations.length}</span>
          </span>
        )}
        <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
          {String(cards.length).padStart(2, '0')}
        </span>
      </header>

      {/* ── Cards ── */}
      <ScrollArea className="flex-1">
        <div
          ref={setNodeRef}
          className={`flex flex-col gap-1.5 min-h-[80px] p-2 transition-colors ${isOver ? 'bg-accent/30' : ''}`}
        >
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <BoardCard key={card.id} card={card} onClick={onCardClick} />
            ))}
          </SortableContext>
          {cards.length === 0 && !isOver && (
            <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/40 mb-1">
                ━━ vazio ━━
              </span>
              <p className="text-[10px] text-muted-foreground/50 leading-snug">
                Arraste um card ou clique em <span className="font-mono">+ Novo</span>
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Add card ── */}
      <div className="p-1.5 border-t border-border/60">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground text-[11px] h-7 font-mono uppercase tracking-[0.12em]"
          onClick={() => onAddCard(column.id)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Novo card
        </Button>
      </div>
    </section>
  )
}
