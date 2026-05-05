import type { Card } from '@/entities/card/types'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import { Calendar, User, Bot } from 'lucide-react'

interface CardFlightStripProps {
  card: Card | null
  isEditing: boolean
}

// Header tipo "flight strip" — identificação fixa do card no estilo cockpit.
// Mostra ID curto, tipo, prioridade, due date e responsável como chips mono.
export function CardFlightStrip({ card, isEditing }: CardFlightStripProps) {
  if (!isEditing || !card) {
    return (
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        ━━ NOVO CARD ━━
      </div>
    )
  }

  const shortId = card.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
  const typeCfg = CARD_TYPE_CONFIG[card.type]
  const prioCfg = CARD_PRIORITY_CONFIG[card.priority]
  const due = card.due_date ? new Date(card.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null

  const responsavelLabel = card.assignee === 'ai-agent' ? 'AI'
    : card.assignee === 'eu' ? 'EU'
    : card.assignee?.toUpperCase().slice(0, 6) || '—'

  return (
    <div className="flex items-center gap-2 flex-wrap font-mono text-[10px] uppercase tracking-[0.12em]">
      <span className="text-muted-foreground">CARD</span>
      <span className="rounded-sm bg-muted/60 px-1.5 py-0.5 text-foreground tabular-nums">#{shortId}</span>
      <span className="text-muted-foreground/40">·</span>
      <span className={`rounded-sm px-1.5 py-0.5 ${typeCfg.bgColor} ${typeCfg.color} border-0`}>{typeCfg.label}</span>
      <span className="text-muted-foreground/40">·</span>
      <span className={`rounded-sm px-1.5 py-0.5 ${prioCfg.bgColor} ${prioCfg.color}`}>P:{prioCfg.label}</span>
      {due && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-2.5 w-2.5" />
            {due}
          </span>
        </>
      )}
      <span className="text-muted-foreground/40">·</span>
      <span className="flex items-center gap-1 text-muted-foreground">
        {card.assignee === 'ai-agent' ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
        RESP: {responsavelLabel}
      </span>
    </div>
  )
}
