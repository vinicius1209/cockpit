import { useState, useEffect } from 'react'
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
import type { DiscoveryResult, DiscoveryCard, InstalledAgent } from '@/entities/card/project-types'
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
} from 'lucide-react'

export function DiscoveryPage() {
  const navigate = useNavigate()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { getWorkspaceProjects } = useProjectStore()
  const { addCard, getWorkspaceColumns, getColumnCards } = useCardStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [useAgent, setUseAgent] = useState<string>('none')
  const [projectOpen, setProjectOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importedCards, setImportedCards] = useState<Set<number>>(new Set())
  const [daemonOnline, setDaemonOnline] = useState<boolean | null>(null)
  const [agents, setAgents] = useState<InstalledAgent[]>([])

  useEffect(() => {
    daemonClient.health()
      .then(() => {
        setDaemonOnline(true)
        return daemonClient.getAvailableAgents()
      })
      .then(setAgents)
      .catch(() => setDaemonOnline(false))
  }, [])

  if (!activeWorkspaceId) {
    return <div className="p-6 text-muted-foreground">Selecione um workspace na sidebar</div>
  }

  const projects = getWorkspaceProjects(activeWorkspaceId)
  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  const handleRunDiscovery = async () => {
    if (!selectedProject) return
    setIsRunning(true)
    setError(null)
    setResult(null)
    setImportedCards(new Set())

    try {
      const agent = useAgent === 'none' ? undefined : useAgent
      const discoveryResult = await daemonClient.runDiscovery(selectedProject.path, agent)
      setResult(discoveryResult)
      toast.success(`Discovery concluido: ${discoveryResult.cards.length} descobertas`, {
        description: discoveryResult.scanResult.stack.join(', ') || selectedProject.name,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao rodar discovery'
      setError(msg)
      toast.error('Falha no discovery', { description: msg })
    } finally {
      setIsRunning(false)
    }
  }

  const handleImportCard = (discoveryCard: DiscoveryCard, index: number) => {
    const columns = getWorkspaceColumns(activeWorkspaceId)
    const inboxColumn = columns.find((c) => c.slug === 'inbox') || columns[0]
    if (!inboxColumn) return

    const cardsInColumn = getColumnCards(activeWorkspaceId, inboxColumn.id)

    addCard({
      workspace_id: activeWorkspaceId,
      column_id: inboxColumn.id,
      project_id: selectedProject?.id || null,
      title: discoveryCard.title,
      description: discoveryCard.description,
      type: discoveryCard.type as CardType,
      priority: discoveryCard.priority as CardPriority,
      position: cardsInColumn.length,
      assignee: null,
      due_date: null,
      spec_status: null,
      spec_content: null,
      interview_notes: null,
    })

    setImportedCards((prev) => new Set([...prev, index]))
  }

  const handleImportAll = () => {
    if (!result) return
    let count = 0
    result.cards.forEach((card, i) => {
      if (!importedCards.has(i)) {
        handleImportCard(card, i)
        count++
      }
    })
    toast.success(`${count} cards importados para o Inbox`)
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

            {/* Mode combobox */}
            <div className="w-56 space-y-1.5">
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
                      <span className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                        {agents.find((a) => a.name === useAgent)?.name || useAgent}
                      </span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar modo..." />
                    <CommandList>
                      <CommandEmpty>Nenhum agent encontrado.</CommandEmpty>
                      <CommandGroup heading="Scanner">
                        <CommandItem
                          value="scanner-rapido"
                          onSelect={() => { setUseAgent('none'); setModeOpen(false) }}
                        >
                          <Search className="h-3.5 w-3.5 text-muted-foreground" />
                          <div className="flex flex-col ml-1">
                            <span>Scanner rapido</span>
                            <span className="text-[11px] text-muted-foreground">TODOs, git status, dependencias</span>
                          </div>
                          <Check className={cn('ml-auto h-4 w-4', useAgent === 'none' ? 'opacity-100' : 'opacity-0')} />
                        </CommandItem>
                      </CommandGroup>
                      {agents.length > 0 && (
                        <CommandGroup heading="AI Agents">
                          {agents.map((a) => (
                            <CommandItem
                              key={a.name}
                              value={a.name}
                              onSelect={() => { setUseAgent(a.name); setModeOpen(false) }}
                            >
                              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                              <div className="flex flex-col ml-1">
                                <span>{a.name}</span>
                                <span className="text-[11px] text-muted-foreground">{a.version?.split(' ')[0] || 'installed'}</span>
                              </div>
                              <Check className={cn('ml-auto h-4 w-4', useAgent === a.name ? 'opacity-100' : 'opacity-0')} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
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

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ── Loading state ── */}
      {isRunning && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Radar className="h-8 w-8 text-primary animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Escaneando {selectedProject?.name}...</p>
            <p className="text-xs text-muted-foreground mt-1">
              {useAgent === 'none' ? 'Analisando codigo, git e dependencias' : `Usando ${useAgent} para analise profunda`}
            </p>
          </div>
        </div>
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
            {result.cards.map((card, i) => {
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
