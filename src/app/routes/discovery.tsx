import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useProjectStore } from '@/entities/card/project-store'
import { useCardStore } from '@/entities/card/store'
import { daemonClient } from '@/shared/lib/daemon-client'
import type { DiscoveryResult, DiscoveryCard, InstalledAgent, JobSummary } from '@/entities/card/project-types'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import type { CardType, CardPriority } from '@/entities/card/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Search,
  Loader2,
  Plus,
  Sparkles,
  FolderOpen,
  ArrowRight,
  Bot,
  CheckCircle2,
  AlertCircle,
  Settings,
  Radar,
  Import,
  CircleDot,
  ChevronsUpDown,
  Check,
  History,
  Clock,
} from 'lucide-react'

export function DiscoveryPage() {
  const navigate = useNavigate()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { getWorkspaceProjects } = useProjectStore()
  const { addCard, getWorkspaceColumns, getColumnCards } = useCardStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [useAgent, setUseAgent] = useState<string>('none')
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importedCards, setImportedCards] = useState<Set<number>>(new Set())
  const [daemonOnline, setDaemonOnline] = useState<boolean | null>(null)
  const [agents, setAgents] = useState<InstalledAgent[]>([])
  const [activeSubProject, setActiveSubProject] = useState<string | null>(null)
  const [currentPhase, setCurrentPhase] = useState('')
  const [progressEvents, setProgressEvents] = useState<{ phase: string; message: string }[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [jobHistory, setJobHistory] = useState<JobSummary[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Elapsed timer
  useEffect(() => {
    if (!isRunning) { setElapsed(0); return }
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [isRunning])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [progressEvents])

  useEffect(() => {
    daemonClient.health()
      .then(() => {
        setDaemonOnline(true)
        return daemonClient.getAvailableAgents()
      })
      .then(setAgents)
      .catch(() => setDaemonOnline(false))
  }, [])

  // Load history when project changes
  useEffect(() => {
    if (!selectedProjectId || !daemonOnline) return
    const proj = getWorkspaceProjects(activeWorkspaceId || '').find((p) => p.id === selectedProjectId)
    if (!proj) return

    daemonClient.listDiscoveryJobs(proj.path, 10)
      .then((jobs) => {
        setJobHistory(jobs)
        // Auto-load last completed scan
        const lastCompleted = jobs.find((j) => j.status === 'completed')
        if (lastCompleted && !result && !isRunning) {
          setActiveJobId(lastCompleted.id)
          daemonClient.getDiscoveryJob(lastCompleted.id)
            .then((job) => {
              const j = job as { result: DiscoveryResult | null }
              if (j.result) setResult(j.result)
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [selectedProjectId, daemonOnline])

  if (!activeWorkspaceId) {
    return <div className="p-6 text-muted-foreground">Selecione um workspace na sidebar</div>
  }

  const projects = getWorkspaceProjects(activeWorkspaceId)
  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  const refreshHistory = () => {
    if (!selectedProject) return
    daemonClient.listDiscoveryJobs(selectedProject.path, 10)
      .then(setJobHistory)
      .catch(() => {})
  }

  const handleRunDiscovery = async () => {
    if (!selectedProject) return
    setIsRunning(true)
    setError(null)
    setResult(null)
    setImportedCards(new Set())
    setProgressEvents([])
    setCurrentPhase('')
    setActiveSubProject(null)

    const agent = useAgent === 'none' ? undefined : useAgent

    // Fast-path: scanner only (synchronous, ~1s)
    if (!agent) {
      try {
        const discoveryResult = await daemonClient.runDiscovery(selectedProject.path, undefined, undefined)
        setResult(discoveryResult)
        toast.success(`Discovery concluido: ${discoveryResult.cards.length} descobertas`, {
          description: discoveryResult.scanResult.stack.join(', ') || selectedProject.name,
        })
        refreshHistory()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao rodar discovery'
        setError(msg)
        toast.error('Falha no discovery', { description: msg })
      } finally {
        setIsRunning(false)
      }
      return
    }

    // Slow-path: with agent → job queue + SSE
    try {
      const { jobId } = await daemonClient.startDiscovery(selectedProject.path, agent, selectedModel || undefined)
      const DAEMON_URL = import.meta.env.VITE_DAEMON_URL || 'http://localhost:4800'
      const es = new EventSource(`${DAEMON_URL}/discovery/stream/${jobId}`)

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.message) {
            setCurrentPhase(data.message)
            setProgressEvents((prev) => [...prev, { phase: data.phase, message: data.message }])
          }
          if (data.phase === 'completed' && data.result) {
            setResult(data.result as DiscoveryResult)
            setIsRunning(false)
            toast.success(`Discovery concluido: ${(data.result as DiscoveryResult).cards.length} descobertas`)
            refreshHistory()
            es.close()
          }
          if (data.phase === 'failed') {
            setError(data.error || data.message || 'Erro desconhecido')
            setIsRunning(false)
            toast.error('Falha no discovery', { description: data.error || data.message })
            es.close()
          }
        } catch {
          // skip malformed events
        }
      }

      es.onerror = () => {
        es.close()
        // Try to recover: check job status, reconnect if still running
        daemonClient.getDiscoveryJob(jobId)
          .then((job) => {
            const j = job as { status: string; result: DiscoveryResult | null; error: string | null }
            if (j.status === 'completed' && j.result) {
              setResult(j.result)
              setIsRunning(false)
              toast.success(`Discovery concluido: ${j.result.cards.length} descobertas`)
            } else if (j.status === 'failed') {
              setError(j.error || 'Erro desconhecido')
              setIsRunning(false)
            } else {
              // Job still running — poll every 5s until done
              setCurrentPhase('Reconectando... agent ainda em execucao')
              const poll = setInterval(() => {
                daemonClient.getDiscoveryJob(jobId)
                  .then((j2) => {
                    const job2 = j2 as { status: string; result: DiscoveryResult | null; error: string | null }
                    if (job2.status === 'completed' && job2.result) {
                      clearInterval(poll)
                      setResult(job2.result)
                      setIsRunning(false)
                      toast.success(`Discovery concluido: ${job2.result.cards.length} descobertas`)
                    } else if (job2.status === 'failed') {
                      clearInterval(poll)
                      setError(job2.error || 'Erro desconhecido')
                      setIsRunning(false)
                    }
                  })
                  .catch(() => {
                    clearInterval(poll)
                    setError('Conexao com daemon perdida')
                    setIsRunning(false)
                  })
              }, 5000)
            }
          })
          .catch(() => {
            setError('Conexao com daemon perdida')
            setIsRunning(false)
          })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar discovery'
      setError(msg)
      toast.error('Falha no discovery', { description: msg })
      setIsRunning(false)
    }
  }

  const handleImportCard = (discoveryCard: DiscoveryCard, index: number) => {
    const columns = getWorkspaceColumns(activeWorkspaceId)
    const inboxColumn = columns.find((c) => c.slug === 'inbox') || columns[0]
    if (!inboxColumn) return

    const cardsInColumn = getColumnCards(activeWorkspaceId, inboxColumn.id)

    // Build enriched description with sub-project context
    const descParts: string[] = []
    if (discoveryCard.subProject) descParts.push(`**Projeto:** ${discoveryCard.subProject}`)
    if (discoveryCard.description) descParts.push(discoveryCard.description)
    if (discoveryCard.source === 'agent') descParts.push(`\n_Descoberto via ${discoveryCard.metadata.agent || 'agent'}_`)
    const enrichedDescription = descParts.join('\n\n') || null

    const cardId = addCard({
      workspace_id: activeWorkspaceId,
      column_id: inboxColumn.id,
      project_id: selectedProject?.id || null,
      title: discoveryCard.subProject ? `[${discoveryCard.subProject}] ${discoveryCard.title}` : discoveryCard.title,
      description: enrichedDescription,
      type: discoveryCard.type as CardType,
      priority: discoveryCard.priority as CardPriority,
      position: cardsInColumn.length,
      assignee: null,
      due_date: null,
      spec_status: null,
      spec_content: null,
      interview_notes: null,
      interview_messages: null,
    })

    // Link finding to card via fingerprint
    const diffFinding = result?.diff?.findings.find(
      (f) => f.title === discoveryCard.title && f.type === discoveryCard.type,
    )
    if (diffFinding?.fingerprint && selectedProject) {
      daemonClient.linkFinding(selectedProject.path, diffFinding.fingerprint, cardId)
        .catch(() => { /* best-effort linking */ })
    }

    setImportedCards((prev) => new Set([...prev, index]))
  }

  const handleImportAll = () => {
    if (!result) return
    let count = 0
    const types: Record<string, number> = {}
    result.cards.forEach((card, i) => {
      if (!importedCards.has(i)) {
        handleImportCard(card, i)
        count++
        types[card.type] = (types[card.type] || 0) + 1
      }
    })
    const summary = Object.entries(types).map(([t, c]) => `${c} ${t}`).join(', ')
    toast.success(`${count} cards importados para o Inbox`, {
      description: summary,
      duration: 4000,
    })
  }

  const remainingCards = result ? result.cards.length - importedCards.size : 0

  // ── No projects registered ──
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Radar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Nenhum projeto registrado</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Para usar o Auto-Discovery, primeiro registre um projeto no workspace.
            O scanner vai analisar o codigo, encontrar TODOs, FIXMEs, debitos tecnicos e gerar cards automaticamente.
          </p>
          <Button onClick={() => navigate(`/workspace/${activeWorkspaceId}/settings`)}>
            <Settings className="h-4 w-4 mr-2" />
            Ir para Configuracoes
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Auto-Discovery</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Escaneie projetos e descubra problemas automaticamente
          </p>
        </div>

        {/* Daemon status pill */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
            daemonOnline ? 'bg-green-500/10 text-green-500' : daemonOnline === false ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'
          }`}>
            <CircleDot className="h-3 w-3" />
            {daemonOnline ? 'Daemon online' : daemonOnline === false ? 'Daemon offline' : 'Conectando...'}
          </div>
        </div>
      </div>

      {/* ── How it works (shown before first scan) ── */}
      {!result && !isRunning && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { step: '1', icon: FolderOpen, title: 'Selecione', desc: 'Escolha o projeto para escanear' },
            { step: '2', icon: Radar, title: 'Escaneie', desc: 'Scanner analisa codigo, git e deps' },
            { step: '3', icon: Import, title: 'Importe', desc: 'Envie descobertas direto pro board' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3 rounded-lg border border-dashed p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Controls ── */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-end gap-3">
            {/* Project combobox */}
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projeto</label>
              <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={projectOpen}
                    className="h-10 w-full justify-between font-normal"
                  >
                    {selectedProject ? (
                      <span className="flex items-center gap-2 truncate">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{selectedProject.name}</span>
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                          {selectedProject.path.replace(/^\/Users\/[^/]+\//, '~/')}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Buscar projeto...</span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar projeto..." />
                    <CommandList>
                      <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
                      <CommandGroup>
                        {projects.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.name}
                            onSelect={() => {
                              setSelectedProjectId(p.id)
                              setProjectOpen(false)
                            }}
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                            <div className="flex flex-col ml-1">
                              <span className="font-medium">{p.name}</span>
                              <span className="text-[11px] text-muted-foreground">{p.path.replace(/^\/Users\/[^/]+\//, '~/')}</span>
                            </div>
                            <Check className={cn('ml-auto h-4 w-4', selectedProjectId === p.id ? 'opacity-100' : 'opacity-0')} />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Mode combobox (agent + model unified) */}
            <div className="w-72 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Modo</label>
              <Popover open={modeOpen} onOpenChange={setModeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={modeOpen}
                    className="h-10 w-full justify-between font-normal"
                  >
                    {useAgent === 'none' ? (
                      <span className="flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        Scanner rapido
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 truncate">
                        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{useAgent}</span>
                        {selectedModel && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {agents.find((a) => a.name === useAgent)?.models.find((m) => m.id === selectedModel)?.label.split(' (')[0] || selectedModel}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar agent ou modelo..." />
                    <CommandList>
                      <CommandEmpty>Nenhum encontrado.</CommandEmpty>
                      <CommandGroup heading="Scanner">
                        <CommandItem
                          value="scanner-rapido"
                          onSelect={() => { setUseAgent('none'); setSelectedModel(null); setModeOpen(false) }}
                        >
                          <Search className="h-3.5 w-3.5 text-muted-foreground" />
                          <div className="flex flex-col ml-1">
                            <span>Scanner rapido</span>
                            <span className="text-[11px] text-muted-foreground">TODOs, git status, dependencias</span>
                          </div>
                          <Check className={cn('ml-auto h-4 w-4', useAgent === 'none' ? 'opacity-100' : 'opacity-0')} />
                        </CommandItem>
                      </CommandGroup>
                      {agents.filter((a) => a.models.length > 0).map((a) => (
                        <CommandGroup key={a.name} heading={`${a.name} ${a.version?.split(' ')[0] || ''}`}>
                          {a.models.map((m) => {
                            const isSelected = useAgent === a.name && selectedModel === m.id
                            const costDot = m.cost === 'low' ? 'bg-green-500' : m.cost === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                            return (
                              <CommandItem
                                key={`${a.name}-${m.id}`}
                                value={`${a.name} ${m.label} ${m.id}`}
                                onSelect={() => {
                                  setUseAgent(a.name)
                                  setSelectedModel(m.id)
                                  setModeOpen(false)
                                }}
                              >
                                <span className={`h-2 w-2 rounded-full ${costDot} shrink-0`} />
                                <div className="flex flex-col ml-1">
                                  <span>{m.label}</span>
                                  <span className="text-[11px] text-muted-foreground">{m.id}</span>
                                </div>
                                <Check className={cn('ml-auto h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Run button */}
            <Button
              className="h-10 px-5"
              onClick={handleRunDiscovery}
              disabled={!selectedProject || isRunning || !daemonOnline}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Escaneando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Rodar Discovery
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── History timeline ── */}
      {jobHistory.length > 0 && !isRunning && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historico</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {jobHistory.map((job) => {
              const isActive = activeJobId === job.id
              const date = new Date(job.createdAt)
              const timeAgo = (() => {
                const mins = Math.floor((Date.now() - date.getTime()) / 60000)
                if (mins < 1) return 'Agora'
                if (mins < 60) return `${mins}min`
                const hrs = Math.floor(mins / 60)
                if (hrs < 24) return `${hrs}h`
                return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
              })()

              return (
                <button
                  key={job.id}
                  onClick={() => {
                    setActiveJobId(job.id)
                    daemonClient.getDiscoveryJob(job.id)
                      .then((j) => {
                        const data = j as { result: DiscoveryResult | null }
                        if (data.result) {
                          setResult(data.result)
                          setImportedCards(new Set())
                        }
                      })
                      .catch(() => toast.error('Erro ao carregar scan'))
                  }}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors min-w-[140px] shrink-0',
                    isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium">{timeAgo}</span>
                    {job.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-green-500 ml-auto" />}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {job.agent || 'scanner'}{job.model ? ` · ${job.model.split('/').pop()}` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{job.cardsCount} cards</Badge>
                    {job.newCount > 0 && (
                      <Badge className="text-[9px] px-1 py-0 bg-green-500/15 text-green-500 border-0">{job.newCount} novas</Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ── Loading state ── */}
      {isRunning && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-4">
            {/* Header with timer */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Radar className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-medium">{currentPhase || `Escaneando ${selectedProject?.name}...`}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed
                  </p>
                </div>
              </div>
            </div>

            {/* Phase stepper */}
            {useAgent !== 'none' && (
              <div className="flex items-center gap-4 text-xs px-1">
                {[
                  { id: 'scanning', label: 'Scanner' },
                  { id: 'running-agent', label: 'Agent' },
                  { id: 'diffing', label: 'Diff' },
                ].map((step, idx) => {
                  const done = progressEvents.some((p) => p.phase === step.id)
                  const active = progressEvents.length > 0 && progressEvents[progressEvents.length - 1].phase === step.id
                  return (
                    <div key={step.id} className="flex items-center gap-1.5">
                      {idx > 0 && <div className={`h-px w-8 ${done ? 'bg-primary' : 'bg-border'}`} />}
                      <div className={`flex items-center gap-1 ${active ? 'text-primary' : done ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                        {done && !active ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : active ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CircleDot className="h-3.5 w-3.5" />
                        )}
                        {step.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Live agent output */}
            {progressEvents.length > 0 && (
              <div
                ref={logRef}
                className="rounded-lg border bg-muted/20 p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-0.5"
              >
                {progressEvents.map((p, i) => (
                  <p key={i} className={p.phase === 'running-agent' ? 'text-muted-foreground' : 'text-primary/80'}>
                    {p.phase === 'running-agent' ? p.message : (
                      <><span className="text-green-500/70">[{p.phase}]</span> {p.message}</>
                    )}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Empty state after scan ── */}
      {result && result.cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <p className="text-sm font-medium">Nenhum problema encontrado</p>
          <p className="text-xs text-muted-foreground">O projeto esta limpo. Tente com um agent para analise mais profunda.</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && result.cards.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold">{result.cards.length} descobertas</h2>
              <Separator orientation="vertical" className="h-4" />
              {result.diff && (
                <div className="flex items-center gap-1.5">
                  {result.diff.baselineCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {result.diff.baselineCount} baseline
                    </Badge>
                  )}
                  {result.diff.newCount > 0 && (
                    <Badge className="text-[10px] bg-green-500/15 text-green-500 border-0">
                      {result.diff.newCount} novas
                    </Badge>
                  )}
                  {result.diff.existingCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {result.diff.existingCount} conhecidas
                    </Badge>
                  )}
                  {result.diff.resolvedCount > 0 && (
                    <Badge className="text-[10px] bg-blue-500/15 text-blue-500 border-0">
                      {result.diff.resolvedCount} resolvidas
                    </Badge>
                  )}
                </div>
              )}
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5">
                {result.scanResult.stack.map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                ))}
                {result.scanResult.git && (
                  <Badge variant="outline" className="text-[10px]">{result.scanResult.git.branch}</Badge>
                )}
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleImportAll}
              disabled={remainingCards === 0}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Importar {remainingCards > 0 ? `todos (${remainingCards})` : 'concluido'}
            </Button>
          </div>

          {/* Sub-project filter */}
          {(() => {
            const subProjects = [...new Set(result.cards.map((c) => c.subProject).filter(Boolean))] as string[]
            if (subProjects.length <= 1) return null
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant={activeSubProject === null ? 'default' : 'outline'}
                  className="cursor-pointer text-[10px]"
                  onClick={() => setActiveSubProject(null)}
                >
                  Todos
                </Badge>
                {subProjects.map((sp) => (
                  <Badge
                    key={sp}
                    variant={activeSubProject === sp ? 'default' : 'outline'}
                    className="cursor-pointer text-[10px]"
                    onClick={() => setActiveSubProject(activeSubProject === sp ? null : sp)}
                  >
                    <FolderOpen className="h-2.5 w-2.5 mr-0.5" />
                    {sp}
                    <span className="ml-1 opacity-60">
                      {result.cards.filter((c) => c.subProject === sp).length}
                    </span>
                  </Badge>
                ))}
              </div>
            )
          })()}

          {/* Resolved findings banner */}
          {result.diff && result.diff.resolvedCount > 0 && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
              <p className="text-sm font-medium text-blue-500 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5" />
                {result.diff.resolvedCount} problema{result.diff.resolvedCount > 1 ? 's' : ''} resolvido{result.diff.resolvedCount > 1 ? 's' : ''} desde o ultimo scan
              </p>
              <div className="space-y-0.5">
                {result.diff.resolved.slice(0, 5).map((r) => (
                  <p key={r.fingerprint} className="text-xs text-muted-foreground line-through">
                    {r.title}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Cards grid */}
          <div className="space-y-2">
            {result.cards
              .filter((card) => !activeSubProject || card.subProject === activeSubProject)
              .map((card) => {
              const i = result.cards.indexOf(card)
              const typeConfig = CARD_TYPE_CONFIG[card.type as CardType]
              const prioConfig = CARD_PRIORITY_CONFIG[card.priority as CardPriority]
              const imported = importedCards.has(i)
              const diffFinding = result.diff?.findings.find(
                (f) => f.title === card.title && f.type === card.type,
              )
              const isNew = diffFinding?.status === 'new'

              return (
                <div
                  key={i}
                  className={`group flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    imported ? 'opacity-40 bg-muted/20' : isNew ? 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10' : 'hover:bg-muted/30'
                  }`}
                >
                  {/* Type indicator */}
                  <div
                    className="mt-1 h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: typeConfig?.color?.includes('blue') ? '#3b82f6' : typeConfig?.color?.includes('red') ? '#ef4444' : typeConfig?.color?.includes('green') ? '#22c55e' : typeConfig?.color?.includes('purple') ? '#8b5cf6' : '#6b7280' }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      {isNew && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-green-500/15 text-green-500 border-0">
                          nova
                        </Badge>
                      )}
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeConfig?.bgColor} ${typeConfig?.color} border-0`}>
                        {typeConfig?.label || card.type}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${prioConfig?.color}`}>
                        {prioConfig?.label || card.priority}
                      </Badge>
                      {card.source === 'agent' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          <Bot className="h-2.5 w-2.5 mr-0.5" />
                          agent
                        </Badge>
                      )}
                      {card.subProject && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                          <FolderOpen className="h-2.5 w-2.5 mr-0.5" />
                          {card.subProject}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug">{card.title}</p>
                    {card.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{card.description}</p>
                    )}
                  </div>

                  {/* Import action */}
                  <Button
                    variant={imported ? 'ghost' : 'outline'}
                    size="sm"
                    className={`shrink-0 h-8 ${imported ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}
                    onClick={() => handleImportCard(card, i)}
                    disabled={imported}
                  >
                    {imported ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-500" />
                        Importado
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                        Inbox
                      </>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
