import { useEffect, useState } from 'react'
import { Loader2, Activity, Cpu } from 'lucide-react'
import type { ProcessingState } from '@/entities/card/store'

interface CardStatusBarProps {
  processing: ProcessingState | undefined
  workspaceName?: string
  projectName?: string | null
  agentName?: string | null
  modelName?: string | null
}

// Persistent telemetry strip — sempre visivel no rodape do card dialog.
// Quando ha processamento ativo, mostra timer e última chunk.
// Quando idle, mostra contexto do workspace/projeto.
export function CardStatusBar({ processing, workspaceName, projectName, agentName, modelName }: CardStatusBarProps) {
  const [elapsed, setElapsed] = useState(0)
  const action = processing?.action

  useEffect(() => {
    if (!action) return
    setElapsed(0)
    const start = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [action])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timer = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  const actionLabel = processing
    ? processing.action === 'discovery' ? 'analisando card'
      : processing.action === 'spec' ? 'gerando spec'
      : 'processando'
    : null

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-t bg-muted/20 font-mono text-[10px] uppercase tracking-[0.1em]">
      {/* LED */}
      {processing ? (
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span className="text-amber-500 font-semibold">LIVE</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-muted-foreground/60">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span>IDLE</span>
        </span>
      )}

      <span className="text-muted-foreground/40">·</span>

      {processing ? (
        <>
          <span className="flex items-center gap-1 text-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            {actionLabel}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="tabular-nums text-amber-500">{timer}</span>
          {processing.chunks.length > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground tabular-nums">{processing.chunks.length} chunks</span>
            </>
          )}
          <span className="ml-auto truncate text-muted-foreground/70 normal-case tracking-normal max-w-[40%]" title={processing.chunks[processing.chunks.length - 1]}>
            {processing.chunks[processing.chunks.length - 1]}
          </span>
        </>
      ) : (
        <>
          {workspaceName && (
            <>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Activity className="h-2.5 w-2.5" />
                ws: {workspaceName}
              </span>
              <span className="text-muted-foreground/40">·</span>
            </>
          )}
          {projectName && (
            <>
              <span className="text-muted-foreground">proj: {projectName}</span>
              <span className="text-muted-foreground/40">·</span>
            </>
          )}
          {agentName && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Cpu className="h-2.5 w-2.5" />
              {agentName}
              {modelName && <span className="text-muted-foreground/60">/{modelName}</span>}
            </span>
          )}
        </>
      )}
    </div>
  )
}
