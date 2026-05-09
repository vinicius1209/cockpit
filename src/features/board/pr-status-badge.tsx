// PR status badge — fetch live status do GitHub via daemon /git/pr-status.
// Mostra estado (DRAFT/OPEN/MERGED/CLOSED) com cor, link clicavel.
// Re-fetch a cada 60s enquanto o componente esta montado.
//
// I2 fix — antes: cada PrStatusBadge tinha seu próprio fetch + interval.
// Workspace com 20 cards apontando pra mesmo PR (re-implementação da mesma
// task) = 20 fetches paralelos a cada 60s (apesar do cache 30s no daemon
// mitigar load real, frontend faz overhead inutil).
//
// Agora: subscriber pattern via Map<url, {status, subscribers, timer}>.
// Multiplos badges do mesmo URL compartilham UM fetch + UM timer.

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

// ── Shared cache + subscribers (I2 fix) ──

interface CacheEntry {
  status: PrStatus | null
  err: string | null
  loading: boolean
  fetchedAt: number  // ms timestamp
  /** I5 fix — contagem de erros consecutivos. Após N falhas, mostra
   *  badge "⚠ check failed" pra avisar que o status pode estar stale. */
  consecutiveErrors: number
  subscribers: Set<(snapshot: { status: PrStatus | null; err: string | null; loading: boolean; consecutiveErrors: number }) => void>
  timer: ReturnType<typeof setInterval> | null
  inFlight: Promise<void> | null
}

const RECURRING_ERROR_THRESHOLD = 3

const cache = new Map<string, CacheEntry>()

async function fetchStatusInto(entry: CacheEntry, url: string): Promise<void> {
  // Coalesce: se já ha fetch em voo, espera ele.
  if (entry.inFlight) return entry.inFlight

  entry.inFlight = (async () => {
    try {
      const res = await fetch(`${DAEMON_URL}/git/pr-status?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        entry.err = `HTTP ${res.status}`
        entry.loading = false
        entry.consecutiveErrors++
      } else {
        entry.status = await res.json() as PrStatus
        entry.err = null
        entry.loading = false
        entry.consecutiveErrors = 0  // I5: reset on success
      }
      entry.fetchedAt = Date.now()
    } catch (e) {
      entry.err = (e as Error).message
      entry.loading = false
      entry.consecutiveErrors++
      // I5 fix — log recurring errors. Antes era silent (so console.log se debug).
      // Agora dev/operator vê no console quando algo está consistentemente falhando.
      if (entry.consecutiveErrors >= RECURRING_ERROR_THRESHOLD) {
        console.warn(`[pr-status] ${entry.consecutiveErrors} erros consecutivos pra ${url}: ${entry.err}`)
      }
    } finally {
      entry.inFlight = null
      // Notifica todos os subscribers
      const snapshot = { status: entry.status, err: entry.err, loading: entry.loading, consecutiveErrors: entry.consecutiveErrors }
      for (const fn of entry.subscribers) fn(snapshot)
    }
  })()
  return entry.inFlight
}

function subscribe(url: string, callback: (snapshot: { status: PrStatus | null; err: string | null; loading: boolean; consecutiveErrors: number }) => void): () => void {
  let entry = cache.get(url)
  if (!entry) {
    entry = {
      status: null,
      err: null,
      loading: true,
      fetchedAt: 0,
      consecutiveErrors: 0,
      subscribers: new Set(),
      timer: null,
      inFlight: null,
    }
    cache.set(url, entry)
  }
  entry.subscribers.add(callback)

  // Se entrou primeiro subscriber → dispara fetch + timer
  if (entry.subscribers.size === 1) {
    void fetchStatusInto(entry, url)
    entry.timer = setInterval(() => {
      const e = cache.get(url)
      if (e) void fetchStatusInto(e, url)
    }, REFRESH_MS)
  } else if (entry.fetchedAt > 0) {
    // Ja temos dado em cache — entrega snapshot imediato pro novo subscriber
    callback({ status: entry.status, err: entry.err, loading: entry.loading, consecutiveErrors: entry.consecutiveErrors })
  }

  return () => {
    const e = cache.get(url)
    if (!e) return
    e.subscribers.delete(callback)
    // Último subscriber saiu → cleanup
    if (e.subscribers.size === 0) {
      if (e.timer) clearInterval(e.timer)
      cache.delete(url)
    }
  }
}

export function PrStatusBadge({ url, compact }: PrStatusBadgeProps) {
  const [status, setStatus] = useState<PrStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [recurring, setRecurring] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribe(url, (snapshot) => {
      setStatus(snapshot.status)
      setErr(snapshot.err)
      setLoading(snapshot.loading)
      setRecurring(snapshot.consecutiveErrors >= RECURRING_ERROR_THRESHOLD)
    })
    return unsubscribe
  }, [url])

  if (loading) {
    return compact
      ? <span className="text-[10px] text-muted-foreground/70 font-mono">PR ...</span>
      : <div className="text-xs text-muted-foreground italic">checando PR...</div>
  }

  // I5 fix — recurring errors viram badge visivel "⚠ check failed". Antes
  // era completamente silencioso (so console).
  if (recurring && err) {
    return compact
      ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-amber-500 hover:text-amber-400 font-mono inline-flex items-center gap-1" title={`falha repetida: ${err}`}>
          <span>⚠</span>
          <span>PR ↗</span>
        </a>
      )
      : (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-amber-500">
            <span>⚠</span>
            <span className="font-mono">PR check failed ({err})</span>
            <a href={url} target="_blank" rel="noreferrer" className="ml-auto hover:text-foreground">
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="text-muted-foreground/70 truncate">{url}</div>
          <div className="text-[10px] text-muted-foreground/50">verifique gh CLI auth ou se o repo ainda existe</div>
        </div>
      )
  }

  if (err || !status) {
    // Sem detalhes (gh não instalado / não auth / repo privado) — mostra link bruto
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
          {err && <div className="text-rose-500/70 text-[10px]">{err === 'HTTP 500' ? '(gh CLI offline ou não autenticado)' : err}</div>}
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
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  return `${d}d atrás`
}
