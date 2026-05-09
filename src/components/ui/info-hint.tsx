// InfoHint — info-icon (i) com tooltip explicando jargao técnico em 1
// linha. Usado em campos onde o termo ('spec status', 'auto_pr',
// 'isolation worktree') pode confundir usuario não 100% técnico.

import { Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

interface InfoHintProps {
  text: string
  /** Detalhe adicional na 2a linha (opcional) */
  detail?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function InfoHint({ text, detail, side = 'top', className }: InfoHintProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex h-3.5 w-3.5 items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors ${className || ''}`}
            aria-label="Mais informação"
            onClick={(e) => e.preventDefault()}
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] text-xs leading-relaxed">
          <div>{text}</div>
          {detail && <div className="text-muted-foreground/80 mt-1">{detail}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
