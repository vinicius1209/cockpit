// Live Agents Panel — visao cross-workspace de TODAS sessions ativas em
// tempo real. Cada session ganha um lane com header (card, agent, phase,
// elapsed) + tail das ultimas chunks live + heatmap de arquivos tocados.
//
// SSE per-session via EventSource. Auto-reconcile a cada 5s pra novas sessions.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCardStore } from '@/entities/card/store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { daemonClient, type AgentSessionDto } from '@/shared/lib/daemon-client'
import { DAEMON_URL } from '@/shared/lib/constants'
import { CockpitPageHeader } from '@/widgets/cockpit-page-header'
import { Button } from '@/components/ui/button'
import { Activity, RefreshCw, FileEdit, Pause, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PrStatusBadge } from '@/features/board/pr-status-badge'
import { InfoHint } from '@/components/ui/info-hint'

interface LaneState {
  sessionId: string
  cardId: string
  cardTitle: string
  cardPrUrl: string | null
  workspaceSlug: string
  workspaceName: string
  agent: string
  model: string | null
  action: string
  phase: string
  startedAt: string
  /** Ultimas chunks ao vivo (sem replay). */
  liveChunks: string[]
  /** Arquivos tocados (acumulado). Map<path, action>. */
  files: Map<string, string>
  finished: boolean
  error: string | null
}

const MAX_CHUNKS_PER_LANE = 20
const MAX_FILES_HEATMAP = 10
const RECONCILE_INTERVAL = 5_000

export function LiveAgentsPage() {
  const { cards } = useCardStore()
  const { workspaces } = useWorkspaceStore()
  const [lanes, setLanes] = useState<Map<string, LaneState>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const lanesRef = useRef(lanes)
  lanesRef.current = lanes

  const wsBySlug = useMemo(() => new Map(workspaces.map((w) => [w.slug, w])), [workspaces])
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const wsByIdRef = useRef(new Map(workspaces.map((w) => [w.id, w])))
  wsByIdRef.current = new Map(workspaces.map((w) => [w.id, w]))

  // EventSources atualmente abertos, indexados por sessionId
  const sourcesRef = useRef<Map<string, EventSource>>(new Map())

  // Tick global pra forcar re-render do elapsed (ms relativos)
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // Reconcile periodico — descobre sessions novas, abre SSE pras que ainda
  // nao temos lane. Tambem detecta sessions que sumiram do listRunning
  // (terminaram entre updates) — marca como finished.
  useEffect(() => {
    let cancelled = false

    const reconcile = async () => {
      try {
        const r = await daemonClient.listRunningSessions()
        if (cancelled) return
        const seen = new Set<string>()
        for (const s of r.sessions) {
          seen.add(s.id)
          if (!lanesRef.current.has(s.id)) {
            // Lane nova
            openLane(s as AgentSessionDto)
          }
        }
        // Sessions que estavam abertas mas nao aparecem mais → encerrou
        for (const [sid] of lanesRef.current) {
          if (!seen.has(sid)) {
            // Pode ja estar marcada finished pelo SSE 'done'/'error' — nao mexe
            // Mas fecha o EventSource pra liberar conexao
            sourcesRef.current.get(sid)?.close()
            sourcesRef.current.delete(sid)
          }
        }
        setLoading(false)
        setErr(null)
      } catch (e) {
        setErr((e as Error).message)
        setLoading(false)
      }
    }

    void reconcile()
    const id = setInterval(reconcile, RECONCILE_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(id)
      // Cleanup todas as conexoes na desmontagem
      for (const es of sourcesRef.current.values()) es.close()
      sourcesRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openLane = (s: AgentSessionDto) => {
    const card = cardsById.get(s.cardId)
    const ws = wsBySlug.get(s.workspaceSlug)

    const lane: LaneState = {
      sessionId: s.id,
      cardId: s.cardId,
      cardTitle: card?.title || '(sem titulo)',
      cardPrUrl: card?.pr_url || null,
      workspaceSlug: s.workspaceSlug,
      workspaceName: ws?.name || s.workspaceSlug,
      agent: s.agent,
      model: s.model,
      action: s.action,
      phase: s.phase,
      startedAt: s.startedAt,
      liveChunks: [],
      files: new Map(),
      finished: false,
      error: null,
    }
    setLanes((prev) => new Map(prev).set(s.id, lane))

    // Open SSE
    const es = new EventSource(`${DAEMON_URL}/agents/sessions/${s.id}/stream`)
    sourcesRef.current.set(s.id, es)

    let replayDone = false
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        if (data.type === 'snapshot') {
          const session = data.session as { phase?: string } | undefined
          if (session?.phase) {
            setLanes((prev) => {
              const next = new Map(prev)
              const cur = next.get(s.id)
              if (cur) next.set(s.id, { ...cur, phase: session.phase! })
              return next
            })
          }
          return
        }
        if (data.type === 'replay-done') {
          replayDone = true
          return
        }
        if (data.type === 'chunk' && replayDone) {
          const text = (data.text as string) || ''
          // Detect file mentions: linhas com '▶ Read|Edit|Write <path>' viram heatmap
          const fileMatch = text.match(/^[▶•]\s+(Read|Edit|Write|Create|Delete)\s+(.+)$/m)
          setLanes((prev) => {
            const next = new Map(prev)
            const cur = next.get(s.id)
            if (!cur) return prev
            const newChunks = [...cur.liveChunks]
            for (const line of text.split('\n')) {
              if (!line.trim()) continue
              newChunks.push(line)
              if (newChunks.length > MAX_CHUNKS_PER_LANE) newChunks.shift()
            }
            const newFiles = new Map(cur.files)
            if (fileMatch) {
              const action = fileMatch[1].toLowerCase()
              const path = fileMatch[2].trim()
              newFiles.set(path, action)
            }
            next.set(s.id, { ...cur, liveChunks: newChunks, files: newFiles })
            return next
          })
          return
        }
        if (data.type === 'done') {
          setLanes((prev) => {
            const next = new Map(prev)
            const cur = next.get(s.id)
            if (cur) next.set(s.id, { ...cur, phase: 'done', finished: true })
            return next
          })
          es.close()
          sourcesRef.current.delete(s.id)
          return
        }
        if (data.type === 'error') {
          setLanes((prev) => {
            const next = new Map(prev)
            const cur = next.get(s.id)
            if (cur) next.set(s.id, { ...cur, phase: 'error', finished: true, error: (data.error as string) || 'erro' })
            return next
          })
          es.close()
          sourcesRef.current.delete(s.id)
          return
        }
      } catch { /* ignore parse error */ }
    }
    es.onerror = () => {
      // EventSource auto-reconnect — nao fechamos. Mas cap de 60s ja vem do daemon.
    }
  }

  const dismissFinished = () => {
    setLanes((prev) => {
      const next = new Map()
      for (const [k, v] of prev) {
        if (!v.finished) next.set(k, v)
      }
      return next
    })
  }

  const activeLanes = Array.from(lanes.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const liveCount = activeLanes.filter((l) => !l.finished).length
  const finishedCount = activeLanes.filter((l) => l.finished).length

  // File heatmap — agregado cross-session
  const fileHeatmap = useMemo(() => {
    const counts = new Map<string, { count: number; sessions: Set<string>; lastAction: string }>()
    for (const lane of activeLanes) {
      if (lane.finished) continue
      for (const [path, action] of lane.files) {
        const cur = counts.get(path) || { count: 0, sessions: new Set(), lastAction: action }
        cur.count++
        cur.sessions.add(lane.sessionId)
        cur.lastAction = action
        counts.set(path, cur)
      }
    }
    return Array.from(counts.entries())
      .map(([path, info]) => ({ path, ...info, conflict: info.sessions.size > 1 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_FILES_HEATMAP)
  }, [activeLanes])

  return (
    <div className="flex flex-col h-full">
      <CockpitPageHeader
        systemLabel="LIVE AGENTS"
        title="Live Agents"
        subtitle="Visao cross-workspace de todas as sessions em curso"
        rightSlot={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-amber-500">
              <Activity className="h-3 w-3" />
              {liveCount} live
            </span>
            {finishedCount > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-muted-foreground">{finishedCount} concluidas</span>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={dismissFinished}>
                  limpar
                </Button>
              </>
            )}
            <span className="text-muted-foreground/30">·</span>
            <span className="text-muted-foreground">refresh: {RECONCILE_INTERVAL / 1000}s</span>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid gap-4 p-3 sm:p-4 grid-cols-1 lg:grid-cols-[1fr_320px]">
        {/* LANES (esquerda) */}
        <div className="overflow-y-auto space-y-3 pr-1">
          {loading && <div className="text-sm text-muted-foreground">carregando...</div>}
          {err && <ErrorBox msg={err} />}
          {!loading && activeLanes.length === 0 && <EmptyState />}
          {activeLanes.map((lane) => <Lane key={lane.sessionId} lane={lane} />)}
        </div>

        {/* HEATMAP (direita) */}
        <div className="overflow-y-auto">
          <FileHeatmap files={fileHeatmap} />
        </div>
      </div>
    </div>
  )
}

// ── Componentes ──

function Lane({ lane }: { lane: LaneState }) {
  const elapsed = Math.floor((Date.now() - new Date(lane.startedAt).getTime()) / 1000)
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m${(elapsed % 60).toString().padStart(2, '0')}s`

  const phaseColor = lane.phase === 'done' ? 'text-emerald-500'
    : lane.phase === 'error' ? 'text-rose-500'
    : 'text-amber-500'
  const led = lane.finished
    ? (lane.phase === 'error' ? '⊘' : '✓')
    : '●'

  const shortId = lane.cardId.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
  const cardLink = `/workspace/${lane.workspaceSlug}?cardId=${encodeURIComponent(lane.cardId)}`

  return (
    <div className={`rounded-md border bg-card transition-all ${lane.finished
      ? (lane.phase === 'error' ? 'border-rose-500/30 opacity-80' : 'border-emerald-500/20 opacity-70')
      : 'border-amber-500/40 shadow-[0_0_20px_-8px_rgba(245,158,11,0.3)]'}`}>
      {/* Lane header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b font-mono text-[10px] uppercase tracking-[0.12em] flex-wrap">
        <span className={`${phaseColor} text-base leading-none`}>{led}</span>
        <Link to={cardLink} className="flex items-center gap-1.5 hover:text-primary transition-colors">
          <span className="rounded-sm bg-muted px-1.5 py-0.5 tabular-nums text-foreground">#{shortId}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-foreground">{lane.action}</span>
        </Link>
        <span className="text-muted-foreground/30">·</span>
        <span>ws: {lane.workspaceName}</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{lane.agent}{lane.model ? `/${lane.model}` : ''}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className={`tabular-nums ${lane.finished ? '' : 'text-amber-500'}`}>{elapsedStr}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className={phaseColor}>{lane.phase}</span>
        <span className="ml-auto text-muted-foreground tabular-nums">{lane.liveChunks.length} chunks</span>
      </div>

      {/* Title + PR badge */}
      <div className="px-3 pt-2 flex items-center gap-2">
        <span className="text-sm font-medium line-clamp-1 flex-1">{lane.cardTitle}</span>
        {lane.cardPrUrl && <PrStatusBadge url={lane.cardPrUrl} compact />}
      </div>

      {/* Live tail */}
      <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
        {lane.liveChunks.length === 0 ? (
          <div className="text-muted-foreground/50 italic">aguardando saida do agent...</div>
        ) : (
          lane.liveChunks.slice(-8).map((line, i) => (
            <div key={i} className="truncate">{line}</div>
          ))
        )}
      </div>

      {/* Error banner */}
      {lane.error && (
        <div className="mx-3 mb-2 rounded-sm border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-500 flex items-start gap-2">
          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
          <span>{lane.error}</span>
        </div>
      )}

      {/* Files touched */}
      {lane.files.size > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {Array.from(lane.files.entries()).slice(-6).map(([path, action]) => (
            <span key={path} className="font-mono text-[10px] rounded-sm bg-muted/60 px-1.5 py-0.5 text-muted-foreground">
              <span className={action === 'edit' || action === 'write' ? 'text-amber-500' : 'text-emerald-500'}>{action[0].toUpperCase()}</span>
              {' '}{path.length > 40 ? '…' + path.slice(-37) : path}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function FileHeatmap({ files }: { files: Array<{ path: string; count: number; sessions: Set<string>; conflict: boolean }> }) {
  return (
    <div className="rounded-md border bg-card sticky top-0">
      <div className="px-3 py-2 border-b font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-2">
        <FileEdit className="h-3 w-3" />
        FILE HEATMAP
        <span className="text-muted-foreground/40">·</span>
        <span>{files.length} ativos</span>
      </div>
      <div className="p-2 space-y-1">
        {files.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 px-2 py-3 text-center italic">
            sem arquivos tocados ainda
          </div>
        ) : (
          files.map((f) => (
            <div
              key={f.path}
              className={`flex items-center gap-2 rounded-sm px-2 py-1 text-[11px] font-mono ${f.conflict ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-muted/40'}`}
              title={f.path + (f.conflict ? ' — TOCADO POR ' + f.sessions.size + ' SESSIONS' : '')}
            >
              <span className={`tabular-nums ${f.conflict ? 'text-rose-500 font-semibold' : 'text-muted-foreground'}`}>
                {f.count}×
              </span>
              <span className="truncate flex-1 text-foreground/80">{f.path}</span>
              {f.conflict && (
                <span className="text-[9px] uppercase tracking-wider text-rose-500 shrink-0">conflict</span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="px-3 py-2 border-t text-[10px] text-muted-foreground space-y-0.5">
        <div className="font-mono uppercase tracking-wider flex items-center gap-1.5">
          <span>guia</span>
          <InfoHint
            text="Quando 2 sessions tocam o mesmo arquivo, voce pode acabar com conflitos de merge."
            detail="O modo --isolation worktree (CLI ou MCP) cria um working tree separado por session — paralelismo real, sem stomping. Custo: full checkout duplicado e node_modules separado."
            side="left"
          />
        </div>
        <div>• <span className="text-rose-500">conflict</span>: 2+ sessions tocaram o mesmo arquivo</div>
        <div>• use <code className="text-amber-500">--isolation worktree</code> pra paralelismo seguro</div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed p-8 text-center space-y-3">
      <div className="flex justify-center">
        <Pause className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <div>
        <p className="font-medium text-sm">Nenhuma session em curso</p>
        <p className="text-xs text-muted-foreground mt-1">
          Dispare uma implementacao via card → tab Implementar, ou pelo Claude Code com{' '}
          <code className="font-mono text-foreground/80">cockpit_implement_async</code>.
        </p>
      </div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-500 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Falha ao listar sessions</p>
        <p className="text-xs text-muted-foreground mt-1">{msg}</p>
      </div>
    </div>
  )
}

// Suprime warning de uso nao-pratico (RefreshCw fica disponivel pra acoes futuras)
void RefreshCw
