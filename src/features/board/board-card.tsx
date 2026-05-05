import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState } from 'react'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import { useCardStore, type ProcessingState } from '@/entities/card/store'
import type { Card } from '@/entities/card/types'
import { GripVertical, Calendar, Loader2, Bot, User, MessageSquare, ScrollText, Rocket, FileText, Square, AlertTriangle } from 'lucide-react'
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
        ${card.archived_at ? 'opacity-50 grayscale-[0.4] border-dashed' : ''}
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
        {processing && <ProcessingBadge processing={processing} />}
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

      {/* Live processing — chunk preview + ABORT inline */}
      {processing && (
        <ProcessingFooter processing={processing} />
      )}
    </div>
  )
}

// ── Processing helpers ──

function actionLabel(action: string): string {
  if (action === 'spec') return 'GERANDO SPEC'
  if (action === 'implementation') return 'IMPLEMENTANDO'
  if (action === 'discovery') return 'DISCOVERY'
  if (action === 'chat') return 'AI CHAT'
  return action.toUpperCase()
}

function ProcessingBadge({ processing }: { processing: ProcessingState }) {
  const isError = processing.status === 'error'
  return (
    <span
      className={`ml-auto flex items-center gap-1 normal-case tracking-normal ${
        isError ? 'text-rose-500' : 'text-amber-500'
      }`}
      title={processing.agent ? `${processing.agent}${processing.model ? '/' + processing.model : ''} · ${processing.action}` : processing.action}
    >
      {isError ? (
        <AlertTriangle className="h-2.5 w-2.5" />
      ) : (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      )}
      <span className="text-[10px] font-semibold">{isError ? 'ERRO' : 'LIVE'}</span>
    </span>
  )
}

function ProcessingFooter({ processing }: { processing: ProcessingState }) {
  // Live timer based on startedAt
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (processing.status !== 'running') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [processing.status])

  const elapsed = Math.floor((now - new Date(processing.startedAt).getTime()) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timer = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const lastChunk = processing.chunks[processing.chunks.length - 1]?.slice(0, 80)

  const isError = processing.status === 'error'
  const tone = isError ? 'rose' : 'amber'

  return (
    <div
      className={`mt-2 pl-2 pr-2 border-t pt-1.5 space-y-0.5 ${
        tone === 'rose' ? 'border-rose-500/20' : 'border-amber-500/20'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Action + timer + abort */}
      <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em]">
        <span className={tone === 'rose' ? 'text-rose-500' : 'text-amber-500'}>
          {isError ? '━ ERRO ━' : `━ ${actionLabel(processing.action)} ━`}
        </span>
        {!isError && (
          <>
            <span className={`tabular-nums ${tone === 'rose' ? 'text-rose-500' : 'text-amber-500'}`}>
              T+{timer}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground/70 normal-case tracking-normal">
              {processing.chunks.length} <span className="text-muted-foreground/50">chunks</span>
            </span>
          </>
        )}
        {processing.status === 'running' && processing.abort && (
          <button
            className="ml-auto flex items-center gap-0.5 rounded-sm border border-rose-500/40 bg-rose-500/10 px-1.5 py-0 text-rose-500 hover:bg-rose-500/20 transition-colors uppercase tracking-[0.14em] text-[9px]"
            onClick={(e) => {
              e.stopPropagation()
              processing.abort?.()
            }}
            title="Abortar execucao"
          >
            <Square className="h-2 w-2" fill="currentColor" />
            ABORT
          </button>
        )}
      </div>

      {/* Last chunk preview / error message */}
      {(lastChunk || isError) && (
        <p
          className={`text-[10px] truncate font-mono ${
            isError ? 'text-rose-500' : 'text-amber-500/80'
          }`}
          title={isError ? processing.error : lastChunk}
        >
          {isError ? (processing.error || 'erro desconhecido') : lastChunk}
        </p>
      )}
    </div>
  )
}
