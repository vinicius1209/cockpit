import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useProjectStore } from '@/entities/card/project-store'
import { useCardStore } from '@/entities/card/store'
import { daemonClient } from '@/shared/lib/daemon-client'
import type { DiscoveryResult, DiscoveryCard } from '@/entities/card/project-types'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import type { CardType, CardPriority } from '@/entities/card/types'
import { Search, Loader2, Plus, Sparkles, FolderOpen } from 'lucide-react'

export function DiscoveryPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { getWorkspaceProjects } = useProjectStore()
  const { addCard, getWorkspaceColumns, getColumnCards } = useCardStore()

  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [useAgent, setUseAgent] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importedCards, setImportedCards] = useState<Set<number>>(new Set())

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
      const discoveryResult = await daemonClient.runDiscovery(
        selectedProject.path,
        useAgent || undefined,
      )
      setResult(discoveryResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rodar discovery')
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
    result.cards.forEach((card, i) => {
      if (!importedCards.has(i)) {
        handleImportCard(card, i)
      }
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          Auto-Discovery
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Escaneie projetos para descobrir problemas, debitos tecnicos e melhorias automaticamente.
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Projeto</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar projeto..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5" />
                        {p.name}
                        <span className="text-xs text-muted-foreground">{p.path}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48 space-y-2">
              <label className="text-sm font-medium">Agent (opcional)</label>
              <Select value={useAgent} onValueChange={setUseAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Scanner basico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Scanner basico</SelectItem>
                  <SelectItem value="claude-code">Claude Code</SelectItem>
                  <SelectItem value="opencode">OpenCode</SelectItem>
                  <SelectItem value="gemini-cli">Gemini CLI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleRunDiscovery} disabled={!selectedProject || isRunning}>
              {isRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
              {isRunning ? 'Escaneando...' : 'Rodar Discovery'}
            </Button>
          </div>

          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              Nenhum projeto registrado. Adicione projetos nas configuracoes do workspace.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Scan info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{result.project}</CardTitle>
                  <CardDescription>
                    {result.cards.length} descobertas — {result.scanResult.stack.join(', ')}
                    {result.scanResult.git && ` — branch: ${result.scanResult.git.branch}`}
                  </CardDescription>
                </div>
                <Button size="sm" onClick={handleImportAll} disabled={importedCards.size === result.cards.length}>
                  <Plus className="h-4 w-4 mr-1" />
                  Importar todos ({result.cards.length - importedCards.size})
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Discovery cards */}
          <ScrollArea className="h-[calc(100vh-400px)]">
            <div className="space-y-3">
              {result.cards.map((card, i) => {
                const typeConfig = CARD_TYPE_CONFIG[card.type as CardType]
                const prioConfig = CARD_PRIORITY_CONFIG[card.priority as CardPriority]
                const imported = importedCards.has(i)

                return (
                  <Card key={i} className={imported ? 'opacity-50' : ''}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${typeConfig?.bgColor} ${typeConfig?.color} border-0`}>
                              {typeConfig?.label || card.type}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${prioConfig?.color}`}>
                              {prioConfig?.label || card.priority}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {card.source}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium">{card.title}</p>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{card.description}</p>
                        </div>
                        <Button
                          variant={imported ? 'ghost' : 'outline'}
                          size="sm"
                          className="shrink-0"
                          onClick={() => handleImportCard(card, i)}
                          disabled={imported}
                        >
                          {imported ? 'Importado' : (
                            <>
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Board
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  )
}
