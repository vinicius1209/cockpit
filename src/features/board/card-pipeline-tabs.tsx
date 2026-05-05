import type { Card } from '@/entities/card/types'
import type { ProcessingState } from '@/entities/card/store'
import { FileText, MessageSquare, ScrollText, Rocket, CircleDot, CircleDashed, Loader2, CheckCircle2, Lock, Bot, CirclePause } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PipelineTab = 'details' | 'interview' | 'spec' | 'implement'

interface CardPipelineTabsProps {
  card: Card | null
  active: PipelineTab
  onChange: (tab: PipelineTab) => void
  onOpenAgent?: () => void
  agentActive?: boolean
  processing?: ProcessingState | undefined
}

// LED states:
// - empty:    nothing yet
// - partial:  has data but not finished (static circle, no spin)
// - running:  agent currently executing for this step (spinner)
// - done:     completed
// - blocked:  prerequisite missing
type LedState = 'empty' | 'partial' | 'running' | 'done' | 'blocked'

interface StepInfo {
  id: PipelineTab
  index: number
  label: string
  icon: typeof FileText
  state: LedState
  hint: string | null
  blockedReason: string | null
}

function led(state: LedState) {
  const sizeClass = 'h-3 w-3'
  if (state === 'done') return <CheckCircle2 className={`${sizeClass} text-emerald-500`} />
  if (state === 'running') return <Loader2 className={`${sizeClass} text-amber-500 animate-spin`} />
  if (state === 'partial') return <CirclePause className={`${sizeClass} text-amber-500/80`} />
  if (state === 'blocked') return <Lock className={`${sizeClass} text-rose-500/70`} />
  return <CircleDashed className={`${sizeClass} text-muted-foreground/40`} />
}

export function CardPipelineTabs({ card, active, onChange, onOpenAgent, agentActive, processing }: CardPipelineTabsProps) {
  const interviewMsgs = card?.interview_messages?.length ?? 0
  const hasInterviewNotes = !!card?.interview_notes?.trim()
  const hasSpec = !!card?.spec_content?.trim()
  const action = processing?.action

  const steps: StepInfo[] = [
    {
      id: 'details',
      index: 1,
      label: 'Detalhes',
      icon: FileText,
      state: card?.title ? 'done' : 'empty',
      hint: null,
      blockedReason: null,
    },
    {
      id: 'interview',
      index: 2,
      label: 'Entrevista',
      icon: MessageSquare,
      state:
        action === 'discovery' ? 'running' :
        hasInterviewNotes ? 'done' :
        interviewMsgs > 0 ? 'partial' : 'empty',
      hint: interviewMsgs > 0 ? `${interviewMsgs} msg${interviewMsgs !== 1 ? 's' : ''}` : null,
      blockedReason: null,
    },
    {
      id: 'spec',
      index: 3,
      label: 'Spec',
      icon: ScrollText,
      state:
        action === 'spec' ? 'running' :
        card?.spec_status === 'done' ? 'done' :
        hasSpec ? 'partial' :
        card?.spec_status ? 'partial' : 'empty',
      hint: card?.spec_status || null,
      blockedReason: null,
    },
    {
      id: 'implement',
      index: 4,
      label: 'Implementar',
      icon: Rocket,
      state:
        action === 'implementation' ? 'running' :
        !hasSpec ? 'blocked' :
        card?.spec_status === 'done' ? 'done' :
        card?.spec_status === 'in_progress' || card?.spec_status === 'review' ? 'partial' :
        'empty',
      hint: null,
      blockedReason: !hasSpec ? 'Gere a spec primeiro' : null,
    },
  ]

  return (
    <div className="flex items-stretch gap-0 border-y bg-muted/10">
      {steps.map((step) => {
        const Icon = step.icon
        const isActive = active === step.id
        const isBlocked = step.state === 'blocked'
        return (
          <button
            key={step.id}
            disabled={isBlocked && !isActive}
            onClick={() => onChange(step.id)}
            title={step.blockedReason || undefined}
            className={`group relative flex-1 flex flex-col items-start justify-center gap-0.5 px-3 py-2 transition-all border-r last:border-r-0 text-left
              ${isActive
                ? 'bg-background shadow-[inset_0_2px_0_0_var(--color-primary)] -mt-px'
                : 'hover:bg-muted/30'}
              ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">[{step.index}]</span>
              <Icon className={`h-3 w-3 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-[11px] font-medium uppercase tracking-wider ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
              {led(step.state)}
            </div>
            {step.hint && (
              <span className={`text-[10px] font-mono pl-7 ${isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                {step.hint}
              </span>
            )}
            {step.state === 'running' && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-amber-500 animate-pulse" />
            )}
          </button>
        )
      })}

      {/* AI Agent — separado, off-pipeline */}
      <div className="border-l-2 border-dashed border-border/60 flex items-center px-2 bg-background">
        <Button
          variant={agentActive ? 'secondary' : 'ghost'}
          size="sm"
          className="h-9 gap-1.5 text-[11px] uppercase tracking-wider"
          onClick={onOpenAgent}
          title="Chat livre com AI agent (off-pipeline)"
        >
          <Bot className="h-3.5 w-3.5" />
          <span>AI Chat</span>
          <CircleDot className="h-2 w-2 text-muted-foreground/50" />
        </Button>
      </div>
    </div>
  )
}
