import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import { useCardStore } from '@/entities/card/store'
import type { Card } from '@/entities/card/types'
import { GripVertical, Calendar, Loader2, Bot, User, MessageSquare, ScrollText, Rocket, FileText } from 'lucide-react'
import { format } from 'date-fns'

interface BoardCardProps {
  card: Card
  onClick: (card: Card) => void
}

// Cockpit-style kanban card.
// Top: #ID · TYPE · P:PRIO   ←mono identifier strip
// Title
// Pipeline LEDs: [1][2][3][4]  ←micro indicator of stage progress
// Footer: due | assignee
export function BoardCard({ card, onClick }: BoardCardProps) {
  const processing = useCardStore((s) => s.processingCards[card.id])
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
  const shortId = card.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
  const interviewMsgs = card.interview_messages?.length ?? 0
  const hasInterviewNotes = !!card.interview_notes?.trim()
  const hasSpec = !!card.spec_content?.trim()

  // Stage LED states
  const stages = [
    { id: 'details', label: 'D', icon: FileText, on: !!card.title },
    { id: 'interview', label: 'I', icon: MessageSquare, on: hasInterviewNotes || interviewMsgs > 0 },
    { id: 'spec', label: 'S', icon: ScrollText, on: hasSpec, status: card.spec_status },
    { id: 'implement', label: 'X', icon: Rocket, on: card.spec_status === 'in_progress' || card.spec_status === 'review' || card.spec_status === 'done' },
  ]

  const assigneeIsAi = card.assignee === 'ai-agent'

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      aria-label={`Card: ${card.title}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(card) } }}
      onClick={() => onClick(card)}
      className={`group relative cursor-pointer rounded-md border bg-card p-2.5 transition-all hover:border-primary/40 hover:shadow-[0_0_0_1px_var(--color-primary)]/20
        ${isDragging ? 'opacity-50 shadow-lg ring-1 ring-primary' : ''}
        ${processing ? 'border-amber-500/60 shadow-[0_0_18px_-4px_rgba(245,158,11,0.4)]' : ''}
      `}
    >
      {/* Left accent bar — color from card type */}
      <span
        className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm ${typeConfig.bgColor.replace('bg-', 'bg-')}`}
        aria-hidden
      />

      {/* Drag handle — only visible on hover, top-right */}
      <button
        className={`absolute top-1 right-1 p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ${processing ? 'pointer-events-none !opacity-0' : ''}`}
        {...attributes}
        {...(processing ? {} : listeners)}
        disabled={!!processing}
        onClick={(e) => e.stopPropagation()}
        aria-label="Arrastar"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>

      {/* Identifier strip */}
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground pl-2 pr-4">
        <span className="tabular-nums">#{shortId}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className={`${typeConfig.color}`}>{typeConfig.label}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className={priorityConfig.color}>P:{priorityConfig.label.slice(0, 3)}</span>
        {processing && (
          <span className="ml-auto flex items-center gap-1 text-amber-500 normal-case tracking-normal">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            <span className="text-[10px] font-semibold">LIVE</span>
          </span>
        )}
      </div>

      {/* Title */}
      <p className="mt-1.5 pl-2 pr-4 text-[13px] font-medium leading-snug line-clamp-3">{card.title}</p>

      {/* Pipeline LEDs */}
      <div className="mt-2 pl-2 pr-4 flex items-center gap-0.5">
        {stages.map((stage, i) => {
          const Icon = stage.icon
          const isActive = stage.on
          return (
            <div
              key={stage.id}
              className="flex items-center"
              title={`[${i + 1}] ${stage.id}${stage.status ? ` · ${stage.status}` : ''}`}
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-colors
                  ${isActive
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                    : 'bg-muted/40 border-border/60 text-muted-foreground/30'
                  }`}
              >
                <Icon className="h-2 w-2" strokeWidth={3} />
              </span>
              {i < stages.length - 1 && (
                <span className={`h-px w-1 ${stage.on ? 'bg-emerald-500/40' : 'bg-border/40'}`} />
              )}
            </div>
          )
        })}

        {card.spec_status && (
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/80">
            {card.spec_status}
          </span>
        )}
      </div>

      {/* Labels — color dashes */}
      {card.labels.length > 0 && (
        <div className="mt-2 pl-2 pr-4 flex items-center gap-0.5 flex-wrap">
          {card.labels.slice(0, 6).map((cl) => (
            <span
              key={cl.label_id}
              className="h-[3px] w-5 rounded-full inline-block"
              style={{ backgroundColor: cl.label?.color ?? '#6b7280' }}
              title={cl.label?.name}
            />
          ))}
          {card.labels.length > 6 && (
            <span className="text-[9px] text-muted-foreground font-mono">+{card.labels.length - 6}</span>
          )}
        </div>
      )}

      {/* Footer — due + assignee */}
      {(card.due_date || card.assignee) && (
        <div className="mt-2 pl-2 pr-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
          {card.due_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              <span className="tabular-nums normal-case tracking-normal">{format(new Date(card.due_date), 'dd/MM')}</span>
            </span>
          )}
          {card.assignee && (
            <span className="ml-auto flex items-center gap-1">
              {assigneeIsAi ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
              <span>{assigneeIsAi ? 'AI' : (card.assignee.length > 6 ? card.assignee.slice(0, 6).toUpperCase() : card.assignee.toUpperCase())}</span>
            </span>
          )}
        </div>
      )}

      {/* Live processing chunk preview */}
      {processing && processing.chunks.length > 0 && (
        <div className="mt-2 pl-2 pr-4 border-t border-amber-500/20 pt-1.5">
          <p className="text-[10px] text-amber-500/80 truncate font-mono">
            {processing.chunks[processing.chunks.length - 1]}
          </p>
        </div>
      )}
    </div>
  )
}
