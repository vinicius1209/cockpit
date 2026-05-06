// PR status badge — fetch live status do GitHub via daemon /git/pr-status.
// Mostra estado (DRAFT/OPEN/MERGED/CLOSED) com cor, link clicavel.
// Re-fetch a cada 60s enquanto o componente esta montado.

import { useEffect, useState } from 'react'
import { DAEMON_URL } from '@/shared/lib/constants'
import { GitPullRequest, ExternalLink } from 'lucide-react'

interface PrStatus {
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  mergedAt: string | null
  closedAt: string | null
  title: string
  url: string
  number: number
  author?: { login: string }
}

interface PrStatusBadgeProps {
  url: string
  /** Se true, fica em uma linha compacta. Default: full card. */
  compact?: boolean
}

const REFRESH_MS = 60_000

export function PrStatusBadge({ url, compact }: PrStatusBadgeProps) {
  const [status, setStatus] = useState<PrStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchStatus = async () => {
      try {
        const res = await fetch(`${DAEMON_URL}/git/pr-status?url=${encodeURIComponent(url)}`)
        if (cancelled) return
        if (!res.ok) {
          setErr(`HTTP ${res.status}`)
          setLoading(false)
          return
        }
        const data = await res.json() as PrStatus
        setStatus(data)
        setErr(null)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setErr((e as Error).message)
        setLoading(false)
      }
    }

    void fetchStatus()
    const id = setInterval(fetchStatus, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [url])

  if (loading) {
    return compact
      ? <span className="text-[10px] text-muted-foreground/70 font-mono">PR ...</span>
      : <div className="text-xs text-muted-foreground italic">checando PR...</div>
  }

  if (err || !status) {
    // Sem detalhes (gh nao instalado / nao auth / repo privado) — mostra link bruto
    return compact
      ? <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-foreground font-mono">PR ↗</a>
      : (
        <div className="rounded-md border border-dashed bg-muted/20 p-2 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitPullRequest className="h-3 w-3" />
            <span className="font-mono">PR vinculado</span>
            <a href={url} target="_blank" rel="noreferrer" className="ml-auto hover:text-foreground">
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="text-muted-foreground/70 truncate">{url}</div>
          {err && <div className="text-rose-500/70 text-[10px]">{err === 'HTTP 500' ? '(gh CLI offline ou nao autenticado)' : err}</div>}
        </div>
      )
  }

  const stateLabel = status.isDraft ? 'DRAFT' : status.state
  const colors = stateColors(stateLabel)
  const ledColor = colors.led

  if (compact) {
    return (
      <a
        href={status.url}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0 font-mono text-[10px] uppercase tracking-wider ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity`}
        title={status.title}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${ledColor}`} />
        PR #{status.number} {stateLabel}
      </a>
    )
  }

  return (
    <a
      href={status.url}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-md border p-2.5 transition-colors ${colors.border} ${colors.bgSubtle} hover:opacity-90`}
    >
      <div className="flex items-center gap-2">
        <GitPullRequest className={`h-4 w-4 ${colors.text}`} />
        <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${colors.text}`}>
          {stateLabel} · PR #{status.number}
        </span>
        <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
      </div>
      <div className="mt-1.5 text-sm font-medium line-clamp-1">{status.title}</div>
      {status.author && (
        <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">
          @{status.author.login}
        </div>
      )}
      {status.mergedAt && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          merged {timeAgo(status.mergedAt)}
        </div>
      )}
      {status.closedAt && !status.mergedAt && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          closed {timeAgo(status.closedAt)}
        </div>
      )}
    </a>
  )
}

function stateColors(state: string) {
  switch (state) {
    case 'DRAFT':
      return { led: 'bg-amber-500', text: 'text-amber-500', bg: 'bg-amber-500/15', border: 'border-amber-500/30', bgSubtle: 'bg-amber-500/5' }
    case 'OPEN':
      return { led: 'bg-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', bgSubtle: 'bg-emerald-500/5' }
    case 'MERGED':
      return { led: 'bg-violet-500', text: 'text-violet-500', bg: 'bg-violet-500/15', border: 'border-violet-500/30', bgSubtle: 'bg-violet-500/5' }
    case 'CLOSED':
      return { led: 'bg-rose-500', text: 'text-rose-500', bg: 'bg-rose-500/15', border: 'border-rose-500/30', bgSubtle: 'bg-rose-500/5' }
    default:
      return { led: 'bg-muted-foreground', text: 'text-muted-foreground', bg: 'bg-muted', border: 'border-muted', bgSubtle: 'bg-muted/30' }
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atras`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atras`
  const d = Math.floor(h / 24)
  return `${d}d atras`
}
