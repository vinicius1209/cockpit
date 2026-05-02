import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
// Message components available but not used in terminal mode
import { useCardStore } from '@/entities/card/store'
import { useProjectStore } from '@/entities/card/project-store'
import type { Card } from '@/entities/card/types'
import type { ImplementEvent } from '@/entities/card/project-types'
import { Rocket, Square, Loader2, CheckCircle2, CircleDot, FileText, FilePlus, FileX, GitBranch, AlertCircle } from 'lucide-react'

const DAEMON_URL = import.meta.env.VITE_DAEMON_URL || 'http://localhost:4800'

interface ImplementPanelProps {
  card: Card
  workspaceId: string
}

interface TrackedFile {
  path: string
  action: 'modified' | 'created' | 'deleted' | 'changed'
}

type ImplPhase = 'idle' | 'analyzing' | 'branching' | 'implementing' | 'done' | 'error'

export function ImplementPanel({ card, workspaceId }: ImplementPanelProps) {
  const { moveCard, updateCard, getWorkspaceColumns } = useCardStore()
  const { getWorkspaceProjects } = useProjectStore()

  const [phase, setPhase] = useState<ImplPhase>('idle')
  const [outputLines, setOutputLines] = useState<string[]>([])
  const [files, setFiles] = useState<TrackedFile[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImplementEvent['summary'] | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const projects = getWorkspaceProjects(workspaceId)
  const projectPath = card.project_id ? projects.find((p) => p.id === card.project_id)?.path : projects[0]?.path
  const columns = getWorkspaceColumns(workspaceId)

  // Timer
  useEffect(() => {
    if (phase !== 'implementing' && phase !== 'analyzing' && phase !== 'branching') return
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [phase])

  const handleStart = useCallback(async () => {
    if (!card.spec_content || !projectPath) return

    setPhase('analyzing')
    setOutputLines([])
    setFiles([])
    setBranch(null)
    setError(null)
    setSummary(null)
    setElapsed(0)

    // Move card to In Progress
    const inProgressCol = columns.find((c) => c.slug === 'in-progress')
    if (inProgressCol) {
      moveCard(card.id, inProgressCol.id, 0)
    }
    updateCard(card.id, { spec_status: 'in_progress' })

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const response = await fetch(`${DAEMON_URL}/agents/implement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardTitle: card.title,
          cardType: card.type,
          spec: card.spec_content,
          interviewNotes: card.interview_notes || undefined,
          projectPath,
          createBranch: true,
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

            if (event.phase === 'analyzing' || event.phase === 'branching' || event.phase === 'implementing') {
              setPhase(event.phase as ImplPhase)
            }
            if (event.branch) setBranch(event.branch)
            if (event.message) setOutputLines((prev) => [...prev, event.message!])
            if (event.text) setOutputLines((prev) => [...prev, event.text!])
            if (event.phase === 'file' && event.path && event.action) {
              setFiles((prev) => {
                if (prev.some((f) => f.path === event.path)) return prev
                return [...prev, { path: event.path!, action: event.action as TrackedFile['action'] }]
              })
            }
            if (event.phase === 'done') {
              setSummary(event.summary || null)
              setPhase('done')
              // Move to Review
              const reviewCol = columns.find((c) => c.slug === 'review')
              if (reviewCol && event.exitCode === 0) {
                moveCard(card.id, reviewCol.id, 0)
                updateCard(card.id, { spec_status: 'review' })
              }
            }
            if (event.phase === 'error') {
              setError(event.message || 'Erro desconhecido')
              setPhase('error')
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) {
        setPhase('idle')
        return
      }
      setError(err instanceof Error ? err.message : 'Erro de conexao')
      setPhase('error')
    }
  }, [card, projectPath, columns, moveCard, updateCard, workspaceId])

  const handleCancel = () => {
    abortRef.current?.abort()
    setPhase('idle')
  }

  const isRunning = phase === 'analyzing' || phase === 'branching' || phase === 'implementing'

  const fileIcon = (action: string) => {
    if (action === 'created') return <FilePlus className="h-3 w-3 text-green-500" />
    if (action === 'deleted') return <FileX className="h-3 w-3 text-red-500" />
    return <FileText className="h-3 w-3 text-yellow-500" />
  }

  // Idle state — show start button
  if (phase === 'idle' && !summary) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
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
        <Button onClick={handleStart} disabled={!card.spec_content || !projectPath}>
          <Rocket className="h-4 w-4 mr-2" />
          Iniciar Implementacao
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with stepper */}
      <div className="px-4 py-2.5 border-b space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {phase === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {phase === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
            <span className="text-sm font-medium">
              {phase === 'done' ? 'Concluido' : phase === 'error' ? 'Erro' : 'Implementando'}
            </span>
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
          </div>
        </div>

        {/* Phase stepper */}
        <div className="flex items-center gap-3 text-xs">
          {[
            { id: 'analyzing', label: 'Analise' },
            { id: 'branching', label: 'Branch' },
            { id: 'implementing', label: 'Agent' },
            { id: 'done', label: 'Concluido' },
          ].map((step, idx) => {
            const steps = ['analyzing', 'branching', 'implementing', 'done']
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

      {/* Terminal output */}
      <Conversation className="flex-1 bg-muted/10">
        <ConversationContent className="gap-1 px-4 py-3">
          {outputLines.map((line, i) => (
            <p key={i} className="text-[12px] font-mono text-muted-foreground leading-relaxed">
              {line}
            </p>
          ))}
          {isRunning && outputLines.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Aguardando output do agent...</span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

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
          <div className="flex items-center gap-3 text-xs">
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
    </div>
  )
}
