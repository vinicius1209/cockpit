import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCardStore } from '@/entities/card/store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useProjectStore } from '@/entities/card/project-store'
import { daemonClient } from '@/shared/lib/daemon-client'
import type { Card } from '@/entities/card/types'
import type { ImplementEvent } from '@/entities/card/project-types'
import { Textarea } from '@/components/ui/textarea'
import { Rocket, Square, Loader2, CheckCircle2, CircleDot, FileText, FilePlus, FileX, GitBranch, GitPullRequest, AlertCircle, History, RotateCcw, ExternalLink, MessageSquareWarning, XCircle } from 'lucide-react'
import { DAEMON_URL } from '@/shared/lib/constants'
import { toast } from 'sonner'
import { AgentTerminal, type TerminalLine } from './agent-terminal'

interface ImplementPanelProps {
  card: Card
  workspaceId: string
}

interface TrackedFile {
  path: string
  action: 'modified' | 'created' | 'deleted' | 'changed'
}

type ImplPhase = 'idle' | 'analyzing' | 'branching' | 'implementing' | 'creating-pr' | 'done' | 'error'

export function ImplementPanel({ card, workspaceId }: ImplementPanelProps) {
  const { moveCard, updateCard, getWorkspaceColumns, startProcessing, addProcessingChunk, completeProcessing, errorProcessing } = useCardStore()
  const { getWorkspaceProjects } = useProjectStore()

  const [phase, setPhase] = useState<ImplPhase>('idle')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([])
  const [silenceSeconds, setSilenceSeconds] = useState(0)
  const [files, setFiles] = useState<TrackedFile[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImplementEvent['summary'] | null>(null)
  const [history, setHistory] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Array<{ id: string; attempt: number; phase: string; agent: string; branch: string | null; duration: number | null; completedAt: string | null; exitCode: number | null; feedback: string | null }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [attempt, setAttempt] = useState(1)
  const [feedbackText, setFeedbackText] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace())
  const projects = getWorkspaceProjects(workspaceId)
  const activeProject = card.project_id ? projects.find((p) => p.id === card.project_id) : projects[0]
  const projectPath = activeProject?.path
  const columns = getWorkspaceColumns(workspaceId)
  const wsSlug = activeWorkspace?.slug || 'default'

  // Load latest session on mount — restore full state
  useEffect(() => {
    daemonClient.getLatestSession(wsSlug, card.id).then((session) => {
      if (!session) return
      const s = session as {
        phase: string; summary: typeof summary; branch: string | null
        output: string[]; files: TrackedFile[]; error: string | null; attempt: number
      }

      // Always set history flag if session exists
      setHistory('has-sessions')

      if (s.phase === 'done' && s.summary) {
        setPhase('done')
        setSummary(s.summary)
        setBranch(s.branch)
        setOutputLines(s.output || [])
        setFiles(s.files || [])
        if (s.attempt) setAttempt(s.attempt)
      } else if (s.phase === 'error') {
        setError(s.error || 'Erro na ultima execucao')
        setPhase('error')
        setOutputLines(s.output || [])
        setBranch(s.branch)
      }
      // If phase is implementing/analyzing (daemon still running or crashed), show as idle with history
    }).catch(() => {
      // Fallback: check implementation.md for legacy history
      daemonClient.getTaskFile(wsSlug, card.id, 'implementation.md').then((content) => {
        if (content && content.trim()) setHistory(content)
      })
    })
  }, [wsSlug, card.id])

  // Timer
  useEffect(() => {
    if (phase !== 'implementing' && phase !== 'analyzing' && phase !== 'branching') return
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [phase])

  const MAX_ATTEMPTS = 3

  const handleStart = useCallback(async (feedback?: string) => {
    if (!card.spec_content || !projectPath) return

    const currentAttempt = feedback ? attempt + 1 : attempt
    if (currentAttempt > MAX_ATTEMPTS) {
      setError(`Limite de ${MAX_ATTEMPTS} tentativas atingido. Revise a spec ou implemente manualmente.`)
      setPhase('error')
      return
    }
    if (feedback) setAttempt(currentAttempt)

    setPhase('analyzing')
    setOutputLines([])
    setTerminalLines([])
    setSilenceSeconds(0)
    setFiles([])
    setBranch(null)
    setError(null)
    setSummary(null)
    setElapsed(0)
    setShowHistory(false)
    setShowFeedback(false)
    setFeedbackText('')

    // Move card to In Progress
    const inProgressCol = columns.find((c) => c.slug === 'in-progress')
    if (inProgressCol) {
      moveCard(card.id, inProgressCol.id, 0)
    }
    updateCard(card.id, { spec_status: 'in_progress' })

    const abort = new AbortController()
    abortRef.current = abort

    // Inicia processing global — kanban mostra LIVE, sobrevive close do dialog
    startProcessing(card.id, 'implementation', {
      agent: 'claude-code',
      model: 'sonnet',
      abort: () => abort.abort(),
    })

    try {
      const response = await fetch(`${DAEMON_URL}/agents/implement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTitle: card.title,
          cardType: card.type,
          cardId: card.id,
          workspaceSlug: wsSlug,
          spec: card.spec_content,
          interviewNotes: card.interview_notes || undefined,
          projectPath,
          createBranch: true,
          autoPR: activeProject?.auto_pr ?? false,
          feedback: feedback || undefined,
          attempt: currentAttempt,
        }),
        signal: abort.signal,
      })

      if (!response.ok) {
        const err = await response.text()
        setError(`Daemon error: ${err}`)
        setPhase('error')
        return
      }

      const reader = response.body?.getReader()
      if (!reader) { setError('No response body'); setPhase('error'); return }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as ImplementEvent

            if (event.phase === 'analyzing' || event.phase === 'branching' || event.phase === 'implementing' || event.phase === 'creating-pr') {
              const newPhase = event.phase as ImplPhase
              // Quando phase muda, insere um divider visual no terminal
              setPhase((prev) => {
                if (prev !== newPhase) {
                  const labels: Record<string, string> = {
                    analyzing: 'ANALISANDO',
                    branching: 'CRIANDO BRANCH',
                    implementing: 'AGENT EXECUTANDO',
                    'creating-pr': 'CRIANDO PR',
                  }
                  setTerminalLines((lines) => [...lines, {
                    id: `phase-${Date.now()}`,
                    kind: 'phase',
                    text: labels[newPhase] || newPhase.toUpperCase(),
                    ts: Date.now(),
                  }])
                }
                return newPhase
              })
            }
            if (event.branch) setBranch(event.branch)

            // Heartbeat: nao polui o terminal — atualiza so o status bar
            if (event.phase === 'heartbeat') {
              setSilenceSeconds(event.silenceSeconds || 0)
              continue
            }

            // Real chunks/messages — reset silence + append to terminal
            const incoming = event.message || event.text
            if (incoming) {
              setSilenceSeconds(0)
              setOutputLines((prev) => [...prev, incoming])
              addProcessingChunk(card.id, incoming)

              // Classifica para cores semanticas no terminal
              const isTool = incoming.startsWith('▶ ')
              const isLog = !!event.message  // mensagens vem do daemon (analyzing/branching)
              const kind: TerminalLine['kind'] = isTool ? 'tool' : isLog ? 'log' : 'output'

              setTerminalLines((prev) => {
                // Buffer trick: se o ultimo line eh do mesmo kind 'output' e o
                // novo chunk NAO comeca com newline, concatena (resolve o
                // problema de "V" seguido de "ou comecar..." em linhas
                // separadas — agora vira "Vou comecar..." uma linha so).
                if (kind === 'output' && prev.length > 0) {
                  const last = prev[prev.length - 1]
                  if (last.kind === 'output' && !incoming.startsWith('\n')) {
                    return [
                      ...prev.slice(0, -1),
                      { ...last, text: last.text + incoming },
                    ]
                  }
                }
                return [...prev, {
                  id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  kind,
                  text: incoming,
                  ts: Date.now(),
                }]
              })
            }
            if (event.phase === 'file' && event.path && event.action) {
              setFiles((prev) => {
                if (prev.some((f) => f.path === event.path)) return prev
                return [...prev, { path: event.path!, action: event.action as TrackedFile['action'] }]
              })
            }
            if (event.phase === 'done') {
              setSummary(event.summary || null)
              setPhase('done')
              completeProcessing(card.id)
              // Move to Review
              const reviewCol = columns.find((c) => c.slug === 'review')
              if (reviewCol && event.exitCode === 0) {
                moveCard(card.id, reviewCol.id, 0)
                updateCard(card.id, { spec_status: 'review' })
              }
              // Reload history
              daemonClient.getTaskFile(wsSlug, card.id, 'implementation.md').then((content) => {
                if (content) setHistory(content)
              })
            }
            if (event.phase === 'error') {
              setError(event.message || 'Erro desconhecido')
              setPhase('error')
              errorProcessing(card.id, event.message || 'Erro desconhecido')
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) {
        setPhase('idle')
        completeProcessing(card.id)
        return
      }
      const msg = err instanceof Error ? err.message : 'Erro de conexao'
      setError(msg)
      setPhase('error')
      errorProcessing(card.id, msg)
    }
  }, [card, projectPath, columns, moveCard, updateCard, workspaceId, wsSlug, attempt])

  const handleCancel = () => {
    abortRef.current?.abort()
    setPhase('idle')
  }

  const isRunning = phase === 'analyzing' || phase === 'branching' || phase === 'implementing' || phase === 'creating-pr'

  const fileIcon = (action: string) => {
    if (action === 'created') return <FilePlus className="h-3 w-3 text-green-500" />
    if (action === 'deleted') return <FileX className="h-3 w-3 text-red-500" />
    return <FileText className="h-3 w-3 text-yellow-500" />
  }

  // Idle state — show start button + history
  if (phase === 'idle' && !summary) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Rocket className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-sm font-semibold mb-1">Implementar com AI Agent</h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-1">
            O agent vai ler a spec, criar uma branch, e implementar as mudancas no codigo.
          </p>
          {projectPath && (
            <p className="text-[11px] text-muted-foreground mb-4">
              Projeto: {projectPath.replace(/^\/Users\/[^/]+\//, '~/')}
            </p>
          )}
          {!projectPath && (
            <p className="text-[11px] text-destructive mb-4">
              Nenhum projeto vinculado. Adicione nas configuracoes do workspace.
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {!history ? (
              <Button onClick={() => handleStart()} disabled={!card.spec_content || !projectPath}>
                <Rocket className="h-4 w-4 mr-2" />
                Iniciar Implementacao
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowFeedback(!showFeedback)}>
                  <MessageSquareWarning className="h-4 w-4 mr-1" />
                  Nao resolveu
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleStart()}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Re-implementar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const next = !showHistory
                  setShowHistory(next)
                  if (next && sessions.length === 0) {
                    daemonClient.getSessions(wsSlug, card.id).then((data) => {
                      setSessions(data as typeof sessions)
                    }).catch(() => {})
                  }
                }}>
                  <History className="h-4 w-4 mr-1" />
                  Historico
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Feedback — idle state */}
        {showFeedback && history && (
          <div className="border-t px-4 py-3 bg-amber-500/5 space-y-2.5">
            <div className="flex items-center gap-2">
              <MessageSquareWarning className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs font-medium">O que nao funcionou?</span>
            </div>
            <Textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Ex: 'PDF ainda corta na direita em A4 portrait no celular. Precisa reduzir largura para 210mm.'"
              rows={3}
              className="text-xs"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!feedbackText.trim() || !card.spec_content || !projectPath}
                onClick={() => handleStart(feedbackText.trim())}
              >
                <Rocket className="h-3 w-3 mr-1" />
                Re-implementar com feedback
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setShowFeedback(false); setFeedbackText('') }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Sessions timeline */}
        {showHistory && history && (
          <div className="border-t flex-1 min-h-0 overflow-y-auto px-4 py-3 bg-muted/5">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <History className="h-3 w-3" />
              Historico de execucoes ({sessions.length})
            </p>
            {sessions.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Carregando...</p>
            )}
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="rounded-md border px-3 py-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {s.phase === 'done' && s.exitCode === 0 && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {s.phase === 'done' && s.exitCode !== 0 && <AlertCircle className="h-3 w-3 text-amber-500" />}
                      {s.phase === 'error' && <XCircle className="h-3 w-3 text-destructive" />}
                      <span className="font-medium">Tentativa {s.attempt}</span>
                      <span className="text-muted-foreground">{s.agent}</span>
                      {s.branch && (
                        <Badge variant="outline" className="text-[9px]">
                          <GitBranch className="h-2 w-2 mr-0.5" />{s.branch}
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {s.duration ? `${s.duration}s` : '—'}
                    </span>
                  </div>
                  {s.feedback && (
                    <p className="text-muted-foreground italic">Feedback: {s.feedback.slice(0, 100)}{s.feedback.length > 100 ? '...' : ''}</p>
                  )}
                  {s.completedAt && (
                    <p className="text-muted-foreground/60">{new Date(s.completedAt).toLocaleString('pt-BR')}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with stepper */}
      <div className="px-4 py-2.5 border-b space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
            )}
            {phase === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {phase === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
            <span className="text-sm font-medium">
              {phase === 'done' ? 'Concluido' : phase === 'error' ? 'Erro' : 'Implementando'}
            </span>
            {isRunning && <span className="text-[10px] text-green-500 font-medium">LIVE</span>}
            {branch && (
              <Badge variant="outline" className="text-[10px]">
                <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                {branch}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </span>
            {isRunning && (
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleCancel}>
                <Square className="h-3 w-3 mr-1" />
                Cancelar
              </Button>
            )}
            {phase === 'done' && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowFeedback(!showFeedback)}>
                  <MessageSquareWarning className="h-3 w-3 mr-1" />
                  Nao resolveu
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    // Move card back to Ready
                    const readyCol = columns.find((c) => c.slug === 'ready')
                    if (readyCol) {
                      useCardStore.getState().moveCard(card.id, readyCol.id, 0)
                      useCardStore.getState().updateCard(card.id, { spec_status: 'ready' })
                    }
                    setPhase('idle')
                    setSummary(null)
                    toast.info('Card movido de volta para Ready')
                  }}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Rejeitar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Phase stepper */}
        <div className="flex items-center gap-3 text-xs">
          {[
            { id: 'analyzing', label: 'Analise' },
            { id: 'branching', label: 'Branch' },
            { id: 'implementing', label: 'Agent' },
            { id: 'creating-pr', label: 'PR' },
            { id: 'done', label: 'Concluido' },
          ].map((step, idx) => {
            const steps = ['analyzing', 'branching', 'implementing', 'creating-pr', 'done']
            const currentIdx = steps.indexOf(phase)
            const stepIdx = idx
            const isDone = currentIdx > stepIdx || phase === 'done'
            const isActive = phase === step.id

            return (
              <div key={step.id} className="flex items-center gap-1.5">
                {idx > 0 && <div className={`h-px w-6 ${isDone ? 'bg-green-500' : isActive ? 'bg-primary' : 'bg-border'}`} />}
                <div className={`flex items-center gap-1 ${isActive ? 'text-primary' : isDone ? 'text-green-500' : 'text-muted-foreground/40'}`}>
                  {isDone ? <CheckCircle2 className="h-3 w-3" /> : isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleDot className="h-3 w-3" />}
                  {step.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Terminal output — cockpit-style */}
      <div className="flex-1 min-h-0 px-4 py-3 flex flex-col">
        <AgentTerminal
          lines={terminalLines}
          isLive={isRunning}
          totalChunks={outputLines.length}
          silenceSeconds={silenceSeconds}
          agentLabel="claude-code/sonnet"
        />
      </div>

      {/* File tracker */}
      {files.length > 0 && (
        <div className="border-t px-4 py-2.5 max-h-32 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Arquivos ({files.length})
          </p>
          <div className="space-y-1">
            {files.map((f) => (
              <div key={f.path} className="flex items-center gap-2 text-[11px]">
                {fileIcon(f.action)}
                <span className="font-mono truncate flex-1">{f.path}</span>
                <span className="text-muted-foreground shrink-0">{f.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && phase === 'done' && (
        <div className="border-t px-4 py-2.5 bg-green-500/5">
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="font-medium">Implementacao concluida</span>
            {summary.branch && (
              <Badge variant="outline" className="text-[10px]">
                <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                {summary.branch}
              </Badge>
            )}
            <span className="text-muted-foreground">
              {summary.filesCreated} criado{summary.filesCreated !== 1 ? 's' : ''}, {summary.filesModified} modificado{summary.filesModified !== 1 ? 's' : ''}
            </span>
            {summary.prUrl && (
              <a
                href={summary.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <GitPullRequest className="h-3 w-3" />
                PR #{summary.prNumber}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border-t px-4 py-2.5 bg-destructive/5">
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </div>
      )}

      {/* Feedback — "Nao resolveu" */}
      {showFeedback && phase === 'done' && (
        <div className="border-t px-4 py-3 bg-amber-500/5 space-y-2.5">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs font-medium">O que nao funcionou? (tentativa {attempt})</span>
          </div>
          <Textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Descreva o problema: ex. 'PDF ainda corta na direita em A4 portrait no celular. Precisa reduzir largura para 210mm.'"
            rows={3}
            className="text-xs"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!feedbackText.trim()}
              onClick={() => handleStart(feedbackText.trim())}
            >
              <Rocket className="h-3 w-3 mr-1" />
              Re-implementar com feedback
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setShowFeedback(false); setFeedbackText('') }}
            >
              Cancelar
            </Button>
            <span className="text-[10px] text-muted-foreground ml-auto">
              Tentativa {attempt + 1} de 3
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
