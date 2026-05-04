import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { Card, BoardColumn as BoardColumnType } from '@/entities/card/types'
import { BoardCard } from './board-card'

interface BoardColumnProps {
  column: BoardColumnType
  cards: Card[]
  onCardClick: (card: Card) => void
  onAddCard: (columnId: string) => void
}

export function BoardColumn({ column, cards, onCardClick, onAddCard }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', column },
  })

  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: column.color ?? '#6b7280' }}
        />
        <h3 className="text-sm font-medium flex-1">{column.name}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{cards.length}</span>
      </div>

      <ScrollArea className="flex-1 p-2">
        <div
          ref={setNodeRef}
          className={`flex flex-col gap-2 min-h-[60px] rounded-md transition-colors ${isOver ? 'bg-accent/50' : ''}`}
        >
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <BoardCard key={card.id} card={card} onClick={onCardClick} />
            ))}
          </SortableContext>
          {cards.length === 0 && !isOver && (
            <p className="text-[11px] text-muted-foreground/40 text-center py-6">
              Arraste um card ou clique em "Novo card"
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground text-xs h-8"
          onClick={() => onAddCard(column.id)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Novo card
        </Button>
      </div>
    </div>
  )
}
