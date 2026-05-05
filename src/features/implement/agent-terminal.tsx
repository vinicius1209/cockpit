import { useEffect, useRef, useState } from 'react'
import { ArrowDown, Pause, Play } from 'lucide-react'

export interface TerminalLine {
  id: string
  /** 'log' = mensagens do daemon (analyzing, branching, etc) — ciano
   *  'output' = texto do agent — branco
   *  'tool' = tool_use ▶ — amarelo
   *  'error' = erro — vermelho */
  kind: 'log' | 'output' | 'tool' | 'error'
  text: string
  ts?: number
}

export interface TerminalProps {
  lines: TerminalLine[]
  /** Status bar info — last activity in seconds, total chunks, etc */
  silenceSeconds?: number
  isLive?: boolean
  totalChunks?: number
  agentLabel?: string
}

// Cockpit-style live terminal:
// - Buffer de texto com newlines preservados (sem cortar palavras em deltas)
// - Cores semanticas por linha (log=cyan, tool=amber, error=rose)
// - Cursor piscando na ultima linha quando live
// - Auto-scroll com toggle (pausa quando user rola pra cima)
// - Status bar embaixo com last-activity + total chunks
export function AgentTerminal({
  lines,
  silenceSeconds = 0,
  isLive = false,
  totalChunks = 0,
  agentLabel,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Auto-scroll quando autoScroll on. Detecta se user rolou pra cima → pausa.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !autoScroll) return
    el.scrollTop = el.scrollHeight
  }, [lines, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (autoScroll && !atBottom) setAutoScroll(false)
    else if (!autoScroll && atBottom) setAutoScroll(true)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-md border bg-black/40 overflow-hidden">
      {/* Terminal viewport */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed"
        style={{ scrollBehavior: autoScroll ? 'smooth' : 'auto' }}
      >
        {lines.length === 0 ? (
          <p className="text-muted-foreground/40 italic">aguardando saida do agent…</p>
        ) : (
          lines.map((line, i) => {
            const isLast = i === lines.length - 1
            const colorClass =
              line.kind === 'log' ? 'text-cyan-400' :
              line.kind === 'tool' ? 'text-amber-400' :
              line.kind === 'error' ? 'text-rose-400' :
              'text-foreground/85'
            return (
              <div key={line.id} className={`whitespace-pre-wrap ${colorClass}`}>
                {line.kind === 'log' && <span className="text-cyan-500/60 mr-1.5">›</span>}
                {line.kind === 'tool' && <span className="text-amber-500 mr-1.5">▶</span>}
                {line.text}
                {isLast && isLive && line.kind !== 'log' && (
                  <span className="inline-block w-1.5 h-3 bg-emerald-400/80 ml-0.5 align-middle animate-[blink_1s_step-end_infinite]" />
                )}
              </div>
            )
          })
        )}
        {/* Floating cursor when no lines yet but live */}
        {lines.length === 0 && isLive && (
          <span className="inline-block w-1.5 h-3 bg-emerald-400/80 align-middle animate-[blink_1s_step-end_infinite]" />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-t border-border/40 bg-black/60 font-mono text-[10px] uppercase tracking-[0.14em]">
        <span className={isLive ? 'text-emerald-500' : 'text-muted-foreground/60'}>
          {isLive ? '● LIVE' : '○ IDLE'}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground">
          <span className="text-foreground tabular-nums">{totalChunks}</span> chunks
        </span>
        {isLive && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className={silenceSeconds > 10 ? 'text-amber-500' : 'text-muted-foreground'}>
              last activity:{' '}
              <span className="tabular-nums">{silenceSeconds}s</span> ago
              {silenceSeconds > 30 && <span className="ml-1 text-amber-500">⚠</span>}
            </span>
          </>
        )}
        {agentLabel && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground/70 normal-case tracking-normal">{agentLabel}</span>
          </>
        )}
        <button
          className={`ml-auto flex items-center gap-1 rounded-sm border px-1.5 py-0 transition-colors ${
            autoScroll
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
          }`}
          onClick={() => {
            const next = !autoScroll
            setAutoScroll(next)
            if (next) {
              const el = containerRef.current
              if (el) el.scrollTop = el.scrollHeight
            }
          }}
          title={autoScroll ? 'Auto-scroll ativo (clique pra pausar)' : 'Pausado (clique pra retomar)'}
        >
          {autoScroll ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
          {autoScroll ? 'AUTO' : 'PAUSED'}
        </button>
        {!autoScroll && (
          <button
            className="flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 text-primary px-1.5 py-0 hover:bg-primary/20"
            onClick={() => {
              setAutoScroll(true)
              const el = containerRef.current
              if (el) el.scrollTop = el.scrollHeight
            }}
            title="Pular para o final"
          >
            <ArrowDown className="h-2.5 w-2.5" />
            BOTTOM
          </button>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
