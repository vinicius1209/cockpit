import { useEffect, useRef, useState } from 'react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Cpu, Radio, ChevronRight } from 'lucide-react'

interface SpecGenerationOverlayProps {
  content: string
  agentName: string | null
  modelName: string | null
  onAbort: () => void
}

// Cockpit-style live transmission overlay during spec generation.
// Shows: large timer, scanline animation, streaming preview, transmission stats.
export function SpecGenerationOverlay({ content, agentName, modelName, onAbort }: SpecGenerationOverlayProps) {
  const [elapsed, setElapsed] = useState(0)
  const [chunkCount, setChunkCount] = useState(0)
  const lastContentLen = useRef(0)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (content.length > lastContentLen.current) {
      setChunkCount((c) => c + 1)
      lastContentLen.current = content.length
    }
  }, [content])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timer = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  const tokenEst = Math.round(content.length / 4) // rough char->token estimate
  const charsPerSec = elapsed > 0 ? Math.round(content.length / elapsed) : 0

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── HEADER STRIP ── */}
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* LIVE LED */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-500 font-bold">
              ━ TRANSMISSION ACTIVE
            </span>
          </div>

          {/* Timer — center stage */}
          <div className="ml-auto flex items-center gap-1.5 font-mono">
            <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">T+</span>
            <span className="text-2xl font-bold tabular-nums text-amber-500 leading-none">
              {timer}
            </span>
          </div>
        </div>

        {/* Telemetry strip */}
        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] flex-wrap">
          <span className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-muted-foreground" />
            <span className="text-foreground">{agentName || 'agent'}</span>
            {modelName && <span className="text-muted-foreground/60">/{modelName}</span>}
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span className="flex items-center gap-1">
            <Radio className="h-3 w-3 text-emerald-500" />
            <span className="text-emerald-500 tabular-nums">{chunkCount}</span>
            <span className="text-muted-foreground">chunks</span>
          </span>
          <span className="text-muted-foreground/30">·</span>
          <span><span className="text-foreground tabular-nums">{content.length}</span> <span className="text-muted-foreground">chars</span></span>
          <span className="text-muted-foreground/30">·</span>
          <span><span className="text-foreground tabular-nums">~{tokenEst}</span> <span className="text-muted-foreground">tk</span></span>
          {charsPerSec > 0 && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span><span className="text-foreground tabular-nums">{charsPerSec}</span> <span className="text-muted-foreground">c/s</span></span>
            </>
          )}

          {/* Abort button */}
          <button
            onClick={onAbort}
            className="ml-auto flex items-center gap-1 rounded-sm border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-500 hover:bg-rose-500/20 transition-colors uppercase tracking-[0.18em]"
          >
            <span className="h-1.5 w-1.5 bg-current" />
            ABORT
          </button>
        </div>

        {/* Indeterminate scanline progress bar */}
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-muted/40 relative">
          <span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-[scanline_1.6s_ease-in-out_infinite]" />
        </div>
        <style>{`
          @keyframes scanline {
            0% { left: -33%; }
            100% { left: 100%; }
          }
        `}</style>
      </div>

      {/* ── STREAMING CONTENT ── */}
      <div className="flex-1 overflow-y-auto">
        {content.trim() ? (
          <div className="p-4">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-3 flex items-center gap-1">
              <ChevronRight className="h-2.5 w-2.5" />
              LIVE STREAM
              <span className="ml-auto text-muted-foreground/40">incoming...</span>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MessageResponse>{content}</MessageResponse>
              <span className="inline-block w-1.5 h-4 bg-amber-500 animate-pulse ml-0.5 align-middle" />
            </div>
          </div>
        ) : (
          <AwaitingPhases elapsed={elapsed} />
        )}
      </div>
    </div>
  )
}

// Phases visuais enquanto o primeiro chunk não chega — da feedback ao usuario
// que algo esta acontecendo (em vez de spinner mudo).
function AwaitingPhases({ elapsed }: { elapsed: number }) {
  // Phases conceituais (estimadas) baseadas em tempo decorrido.
  // Sao otimistas — se demora muito, exibe último phase + dica.
  const phases = [
    { from: 0,  label: 'Inicializando agent CLI',          icon: '⚙' },
    { from: 3,  label: 'Carregando contexto do workspace', icon: '📡' },
    { from: 8,  label: 'Lendo arquivos do projeto',        icon: '📂' },
    { from: 18, label: 'Analisando codigo e dependencias', icon: '🔬' },
    { from: 30, label: 'Processando spec — primeiro chunk a caminho', icon: '✍' },
  ]
  const currentIdx = phases.findIndex((p, i) =>
    elapsed >= p.from && (i === phases.length - 1 || elapsed < phases[i + 1].from)
  )
  const current = phases[currentIdx] || phases[0]

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
      {/* Radar concentric */}
      <div className="relative h-20 w-20">
        <span className="absolute inset-0 rounded-full border border-amber-500/40" />
        <span className="absolute inset-2 rounded-full border border-amber-500/30 animate-ping" />
        <span className="absolute inset-4 rounded-full border border-amber-500/20" />
        <span className="absolute inset-6 rounded-full bg-amber-500/10" />
        <span className="absolute inset-0 flex items-center justify-center">
          <Radio className="h-5 w-5 text-amber-500" />
        </span>
      </div>

      <div className="space-y-1.5 max-w-md">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-amber-500">
          ━ AWAITING TRANSMISSION ━
        </p>

        {/* Current phase — animated */}
        <p className="text-[13px] text-foreground flex items-center justify-center gap-2 min-h-[20px]">
          <span className="opacity-70">{current.icon}</span>
          <span>{current.label}</span>
          <span className="inline-flex gap-0.5 ml-1">
            <span className="h-1 w-1 rounded-full bg-amber-500 animate-[pulse_1.4s_ease-in-out_infinite]" />
            <span className="h-1 w-1 rounded-full bg-amber-500 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="h-1 w-1 rounded-full bg-amber-500 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
          </span>
        </p>

        {/* Phase progress dots */}
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {phases.map((p, i) => (
            <span
              key={p.label}
              className={`h-1 rounded-full transition-all ${
                i < currentIdx ? 'w-4 bg-emerald-500/60' :
                i === currentIdx ? 'w-6 bg-amber-500' :
                'w-2 bg-muted-foreground/20'
              }`}
              title={p.label}
            />
          ))}
        </div>
      </div>

      {/* Slow-warning + log hint */}
      {elapsed > 25 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 max-w-md text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-500 mb-0.5 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            LATENCIA ELEVADA
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Demorando mais que o esperado. O agent pode estar lendo arquivos grandes
            ou aguardando rate limit. Se passar de 2min, considere
            {' '}<button
              className="text-rose-500 hover:underline font-mono uppercase tracking-wider text-[10px]"
              onClick={(e) => { e.preventDefault() }}
            >ABORT</button>
            {' '}e tentar com modelo mais rápido (haiku).
          </p>
        </div>
      )}
    </div>
  )
}
