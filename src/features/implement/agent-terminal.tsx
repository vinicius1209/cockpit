import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react'
import Anser from 'ansi-to-react'
import { ArrowDown, Pause, Play, Search, X, Copy, Eye, EyeOff, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

export interface TerminalLine {
  id: string
  /** 'log' = mensagens do daemon (analyzing, branching, etc) — ciano com prefix
   *  'output' = texto do agent — branco
   *  'tool' = tool_use ▶ — amarelo
   *  'phase' = banner divider tipo ─── ANALYSING ───
   *  'error' = erro — vermelho */
  kind: 'log' | 'output' | 'tool' | 'phase' | 'error'
  text: string
  /** Quando este chunk chegou — usado pra glow fade nos chunks recentes */
  ts?: number
}

export interface TerminalProps {
  lines: TerminalLine[]
  silenceSeconds?: number
  isLive?: boolean
  totalChunks?: number
  agentLabel?: string
  /** Callback quando user clica em um nome de arquivo detectado */
  onFileClick?: (path: string) => void
}

const FRESH_GLOW_MS = 600

// Regex para paths comuns: src/foo.ts, daemon/src/x.tsx, ~/projetos/..., etc.
// Match: path com ao menos uma `/` e extensao reconhecida.
const PATH_REGEX = /([\w./~-]*\/[\w./~-]+\.(?:tsx?|jsx?|md|json|css|scss|html|yml|yaml|toml|sh|py|go|rs|env)\b)/g

// Cockpit-style live terminal:
// - Buffer de texto com newlines preservados
// - ANSI colors (codes do CLI viram cores reais)
// - Filename click-to-copy
// - Search local (Ctrl+F) com highlight + navegacao
// - Glow fade nos chunks novos (animacao de chegada)
// - Auto-scroll com toggle inteligente
// - Status bar com tokens estimados, copy all, verbose toggle
export function AgentTerminal({
  lines,
  silenceSeconds = 0,
  isLive = false,
  totalChunks = 0,
  agentLabel,
  onFileClick,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [verbose, setVerbose] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIdx, setSearchIdx] = useState(0)
  const [copied, setCopied] = useState(false)

  // Filtra tool uses se verbose desligado
  const visibleLines = useMemo(
    () => verbose ? lines : lines.filter((l) => l.kind !== 'tool'),
    [lines, verbose],
  )

  // Indices das linhas que dao match na busca
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return visibleLines
      .map((l, i) => l.text.toLowerCase().includes(q) ? i : -1)
      .filter((i) => i >= 0)
  }, [searchQuery, visibleLines])

  // Token estimate (rough: chars / 4)
  const totalChars = useMemo(
    () => lines.filter((l) => l.kind === 'output').reduce((acc, l) => acc + l.text.length, 0),
    [lines],
  )
  const tokenEstimate = Math.round(totalChars / 4)

  // Auto-scroll
  useEffect(() => {
    const el = containerRef.current
    if (!el || !autoScroll) return
    el.scrollTop = el.scrollHeight
  }, [visibleLines, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (autoScroll && !atBottom) setAutoScroll(false)
    else if (!autoScroll && atBottom) setAutoScroll(true)
  }

  // Ctrl+F local
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && containerRef.current) {
        // Open only if terminal is in viewport / focused
        const rect = containerRef.current.getBoundingClientRect()
        if (rect.height > 0 && rect.bottom > 0) {
          e.preventDefault()
          setSearchOpen(true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
        }
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  // Scroll pra match selecionado
  useEffect(() => {
    if (searchMatches.length === 0) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-line-idx="${searchMatches[searchIdx]}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchIdx, searchMatches])

  const nextMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    setSearchIdx((i) => (i + 1) % searchMatches.length)
  }, [searchMatches.length])
  const prevMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    setSearchIdx((i) => (i - 1 + searchMatches.length) % searchMatches.length)
  }, [searchMatches.length])

  const copyAll = async () => {
    const text = lines.map((l) => {
      if (l.kind === 'log') return `> ${l.text}`
      if (l.kind === 'tool') return `▶ ${l.text}`
      if (l.kind === 'phase') return `─── ${l.text} ───`
      return l.text
    }).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast.success('Output copiado')
    } catch {
      toast.error('Nao foi possivel copiar')
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-md border bg-black/40 overflow-hidden">
      {/* Search bar (top) */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40 bg-black/60">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchIdx(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) prevMatch()
                else nextMatch()
              }
            }}
            placeholder="Buscar no output…"
            className="flex-1 bg-transparent border-0 outline-none font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40"
          />
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {searchMatches.length === 0 ? '0' : `${searchIdx + 1}/${searchMatches.length}`}
          </span>
          <button onClick={prevMatch} disabled={searchMatches.length === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={nextMatch} disabled={searchMatches.length === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronDown className="h-3 w-3" />
          </button>
          <button onClick={() => { setSearchOpen(false); setSearchQuery('') }} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Terminal viewport */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed"
      >
        {visibleLines.length === 0 ? (
          <p className="text-muted-foreground/40 italic">
            {isLive ? (
              <>
                aguardando saida do agent
                <span className="inline-block w-1.5 h-3 bg-emerald-400/80 align-middle animate-[blink_1s_step-end_infinite] ml-1" />
              </>
            ) : 'sem saida'}
          </p>
        ) : (
          visibleLines.map((line, i) => (
            <TerminalLineRow
              key={line.id}
              line={line}
              index={i}
              isLast={i === visibleLines.length - 1}
              isLive={isLive}
              searchQuery={searchQuery}
              isCurrentMatch={searchMatches[searchIdx] === i}
              onFileClick={onFileClick}
            />
          ))
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
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground" title={`${totalChars} chars`}>
          ~<span className="text-foreground tabular-nums">{tokenEstimate}</span> tk
        </span>
        {isLive && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className={silenceSeconds > 10 ? 'text-amber-500' : 'text-muted-foreground'}>
              <span className="tabular-nums">{silenceSeconds}s</span> ago
              {silenceSeconds > 30 && <span className="ml-1">⚠</span>}
            </span>
          </>
        )}
        {agentLabel && (
          <>
            <span className="text-muted-foreground/40 hidden sm:inline">·</span>
            <span className="text-muted-foreground/70 normal-case tracking-normal hidden sm:inline">{agentLabel}</span>
          </>
        )}

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-1">
          <StatusBtn
            active={verbose}
            onClick={() => setVerbose((v) => !v)}
            title={verbose ? 'Esconder tool uses (▶)' : 'Mostrar tool uses (▶)'}
          >
            {verbose ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
            verbose
          </StatusBtn>
          <StatusBtn
            onClick={() => {
              setSearchOpen((v) => !v)
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
            }}
            active={searchOpen}
            title="Buscar no output (⌘+F)"
          >
            <Search className="h-2.5 w-2.5" />
            find
          </StatusBtn>
          <StatusBtn onClick={copyAll} active={copied} title="Copiar output completo">
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? 'copiado' : 'copy'}
          </StatusBtn>
          <StatusBtn
            active={autoScroll}
            onClick={() => {
              const next = !autoScroll
              setAutoScroll(next)
              if (next) {
                const el = containerRef.current
                if (el) el.scrollTop = el.scrollHeight
              }
            }}
            title={autoScroll ? 'Auto-scroll ativo' : 'Pausado'}
            tone={autoScroll ? 'emerald' : 'amber'}
          >
            {autoScroll ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
            {autoScroll ? 'auto' : 'paused'}
          </StatusBtn>
          {!autoScroll && (
            <StatusBtn
              tone="primary"
              onClick={() => {
                setAutoScroll(true)
                const el = containerRef.current
                if (el) el.scrollTop = el.scrollHeight
              }}
              title="Pular para o final"
            >
              <ArrowDown className="h-2.5 w-2.5" />
              bottom
            </StatusBtn>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
        @keyframes terminal-glow {
          0% { background-color: rgba(16, 185, 129, 0.18); }
          100% { background-color: transparent; }
        }
        .terminal-glow { animation: terminal-glow ${FRESH_GLOW_MS}ms ease-out; }
      `}</style>
    </div>
  )
}

// ── Sub-components ──

interface RowProps {
  line: TerminalLine
  index: number
  isLast: boolean
  isLive: boolean
  searchQuery: string
  isCurrentMatch: boolean
  onFileClick?: (path: string) => void
}

function TerminalLineRow({ line, index, isLast, isLive, searchQuery, isCurrentMatch, onFileClick }: RowProps) {
  const isFresh = line.ts && Date.now() - line.ts < FRESH_GLOW_MS

  if (line.kind === 'phase') {
    return (
      <div data-line-idx={index} className="my-1 flex items-center gap-2 text-cyan-400">
        <span className="flex-1 h-px bg-cyan-500/30" />
        <span className="font-semibold uppercase tracking-[0.2em] text-[10px]">{line.text}</span>
        <span className="flex-1 h-px bg-cyan-500/30" />
      </div>
    )
  }

  const colorClass =
    line.kind === 'log' ? 'text-cyan-400' :
    line.kind === 'tool' ? 'text-amber-400' :
    line.kind === 'error' ? 'text-rose-400' :
    'text-foreground/85'

  return (
    <div
      data-line-idx={index}
      className={`whitespace-pre-wrap ${colorClass} ${isFresh ? 'terminal-glow' : ''} ${isCurrentMatch ? 'bg-amber-500/15 ring-1 ring-amber-500/40 rounded-sm' : ''}`}
    >
      {line.kind === 'log' && <span className="text-cyan-500/60 mr-1.5">›</span>}
      {line.kind === 'tool' && <span className="text-amber-500 mr-1.5">▶</span>}
      <RichText text={line.text} searchQuery={searchQuery} kind={line.kind} onFileClick={onFileClick} />
      {isLast && isLive && line.kind !== 'log' && (
        <span className="inline-block w-1.5 h-3 bg-emerald-400/80 ml-0.5 align-middle animate-[blink_1s_step-end_infinite]" />
      )}
    </div>
  )
}

// Renderiza texto com:
// - ANSI escape codes → cores reais (Anser)
// - Highlight de search query
// - Detecta filenames e torna click-to-copy
function RichText({
  text, searchQuery, kind, onFileClick,
}: {
  text: string
  searchQuery: string
  kind: TerminalLine['kind']
  onFileClick?: (path: string) => void
}) {
  // Para 'output' (texto livre do agent) processamos ANSI primeiro;
  // depois enriquecemos com filename detection no plain text.
  const enrichWithPaths = (s: string): ReactNode => {
    if (kind === 'phase') return s

    // Search highlight tem prioridade
    const q = searchQuery.trim()
    const segments: ReactNode[] = []
    let lastIdx = 0

    if (q) {
      const re = new RegExp(escapeRegex(q), 'gi')
      let match
      while ((match = re.exec(s)) !== null) {
        if (match.index > lastIdx) {
          segments.push(...detectPaths(s.slice(lastIdx, match.index), onFileClick))
        }
        segments.push(
          <mark key={`hl-${match.index}`} className="bg-amber-500/30 text-foreground rounded-sm px-0.5">
            {match[0]}
          </mark>,
        )
        lastIdx = match.index + match[0].length
      }
    }
    if (lastIdx < s.length) {
      segments.push(...detectPaths(s.slice(lastIdx), onFileClick))
    }
    return <>{segments}</>
  }

  // Para output: passa primeiro pelo Anser (ANSI), depois enriquecemos.
  // Anser retorna string pura quando nao ha codes — perfeito.
  if (kind === 'output') {
    // Detecta se ha ANSI codes; se sim, deixa o Anser cuidar (sem filename click)
    if (/\x1b\[/.test(text)) {
      return <Anser>{text}</Anser>
    }
  }

  return <>{enrichWithPaths(text)}</>
}

function detectPaths(s: string, onFileClick?: (path: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  let lastIdx = 0
  let match
  PATH_REGEX.lastIndex = 0
  while ((match = PATH_REGEX.exec(s)) !== null) {
    if (match.index > lastIdx) out.push(s.slice(lastIdx, match.index))
    const path = match[0]
    out.push(
      <button
        key={`path-${match.index}-${path}`}
        className="underline decoration-dotted underline-offset-2 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-sm px-0.5 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          if (onFileClick) {
            onFileClick(path)
          } else {
            navigator.clipboard.writeText(path).then(() => toast.success(`copiado: ${path}`)).catch(() => {})
          }
        }}
        title={`Clique para copiar: ${path}`}
      >
        {path}
      </button>,
    )
    lastIdx = match.index + path.length
  }
  if (lastIdx < s.length) out.push(s.slice(lastIdx))
  return out
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function StatusBtn({
  children,
  onClick,
  active,
  title,
  tone = 'default',
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  title?: string
  tone?: 'default' | 'emerald' | 'amber' | 'primary'
}) {
  const toneClass = tone === 'emerald'
    ? (active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20')
    : tone === 'amber'
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
    : tone === 'primary'
    ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
    : (active ? 'border-foreground/40 bg-foreground/10 text-foreground' : 'border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30')
  return (
    <button
      className={`flex items-center gap-1 rounded-sm border px-1.5 py-0 transition-colors uppercase tracking-[0.12em] ${toneClass}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}
