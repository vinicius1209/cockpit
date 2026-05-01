import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Card as CardUI } from '@/components/ui/card'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import type { Card } from '@/entities/card/types'
import { GripVertical, Calendar, ScrollText } from 'lucide-react'
import { format } from 'date-fns'

interface BoardCardProps {
  card: Card
  onClick: (card: Card) => void
}

export function BoardCard({ card, onClick }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const typeConfig = CARD_TYPE_CONFIG[card.type]
  const priorityConfig = CARD_PRIORITY_CONFIG[card.priority]

  return (
    <CardUI
      ref={setNodeRef}
      style={style}
      className={`cursor-pointer border bg-card p-3 transition-shadow hover:shadow-md ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
      onClick={() => onClick(card)}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeConfig.bgColor} ${typeConfig.color} border-0`}>
              {typeConfig.label}
            </Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityConfig.color}`}>
              {priorityConfig.label}
            </Badge>
            {card.spec_status && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-500">
                <ScrollText className="h-2.5 w-2.5 mr-0.5" />
                {card.spec_status}
              </Badge>
            )}
          </div>

          <p className="text-sm font-medium leading-tight">{card.title}</p>

          {card.labels.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {card.labels.map((cl) => (
                <span
                  key={cl.label_id}
                  className="h-1.5 w-6 rounded-full inline-block"
                  style={{ backgroundColor: cl.label?.color ?? '#6b7280' }}
                  title={cl.label?.name}
                />
              ))}
            </div>
          )}

          {(card.due_date || card.assignee) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {card.due_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(card.due_date), 'dd/MM')}</span>
                </div>
              )}
              {card.assignee && (
                <div className="flex items-center gap-1 ml-auto">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium text-primary">
                    {card.assignee.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </CardUI>
  )
}
