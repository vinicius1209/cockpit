import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCardStore } from '@/entities/card/store'
import { useAgentStore } from '@/entities/agent/store'
import { useProjectStore } from '@/entities/card/project-store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { runAgent } from '@/features/agent-runner/agent-service'
import type { Card, SpecStatus } from '@/entities/card/types'
import { MessageResponse } from '@/components/ai-elements/message'
import { createDocFromSpec } from '@/features/docs-vault/auto-doc'
import { toast } from 'sonner'
import { Sparkles, Save, Loader2, Eye, Pencil, BookOpen, Info, Settings } from 'lucide-react'

// Spec status definitions with explicit semantics so the user understands what each means.
const SPEC_STATUSES: { value: SpecStatus; label: string; color: string; hint: string }[] = [
  { value: 'draft',       label: 'Rascunho',     color: 'text-amber-500',  hint: 'Em escrita / em revisao' },
  { value: 'ready',       label: 'Pronta',       color: 'text-blue-500',   hint: 'Aprovada para implementar' },
  { value: 'in_progress', label: 'Implementando',color: 'text-violet-500', hint: 'Implementacao em andamento' },
  { value: 'review',      label: 'Em review',    color: 'text-pink-500',   hint: 'PR aberto, aguardando review' },
  { value: 'done',        label: 'Concluida',    color: 'text-emerald-500',hint: 'Mergeada e finalizada' },
]

const SPEC_TEMPLATE = `## Titulo
{title}

## Contexto
Descreva o contexto do problema ou necessidade.

## Objetivo
O que deve ser alcancado com essa tarefa.

## Requisitos Funcionais
- [ ] RF1:
- [ ] RF2:

## Requisitos Nao Funcionais
- [ ] RNF1:

## Criterios de Aceite
- [ ] CA1:
- [ ] CA2:

## Impacto / Riscos


## Plano de Implementacao
1.
2.

## Estimativa
`

interface SpecPanelProps {
  card: Card
  workspaceId: string
}

export function SpecPanel({ card, workspaceId }: SpecPanelProps) {
  const { updateCard } = useCardStore()
  const { getWorkspaceAgents, getApiKey } = useAgentStore()
  const { getWorkspaceProjects } = useProjectStore()
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace())

  const [content, setContent] = useState(card.spec_content || '')
  const [isGenerating, setIsGenerating] = useState(false)
  const [saved, setSaved] = useState(false)
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>(card.spec_content ? 'preview' : 'edit')
  const abortRef = useRef<AbortController | null>(null)

  const currentStatus = card.spec_status
  const specWriter = getWorkspaceAgents(workspaceId).find((a) => a.role === 'spec-writer')
  const projects = getWorkspaceProjects(workspaceId)

  // Find the best projectPath for this card
  const getProjectPath = (): string | undefined => {
    // If card has a project_id, use that project's path
    if (card.project_id) {
      const proj = projects.find((p) => p.id === card.project_id)
      if (proj) return proj.path
    }
    // Otherwise use first project in workspace
    return projects[0]?.path
  }

  // Build enriched system prompt with workspace context
  const buildSystemPrompt = (): string => {
    const base = specWriter?.system_prompt || ''
    const contextParts: string[] = []

    if (activeWorkspace) {
      contextParts.push(`Workspace: ${activeWorkspace.name}`)
      if (activeWorkspace.description) contextParts.push(`Descricao: ${activeWorkspace.description}`)
    }

    if (projects.length > 0) {
      contextParts.push(`Projetos vinculados: ${projects.map((p) => p.name).join(', ')}`)
    }

    const projectPath = getProjectPath()
    if (projectPath) {
      contextParts.push(`Diretorio do projeto: ${projectPath}`)
      contextParts.push('Voce tem acesso ao codigo-fonte do projeto. Leia os arquivos relevantes para gerar uma spec mais precisa.')
    }

    if (contextParts.length === 0) return base

    return `${base}\n\n## Contexto do Workspace\n${contextParts.join('\n')}`
  }

  const handleSave = () => {
    updateCard(card.id, {
      spec_content: content || null,
      spec_status: content.trim() ? (currentStatus || 'draft') : null,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleStatusChange = (status: SpecStatus) => {
    updateCard(card.id, { spec_status: status })
  }

  const handleGenerateSpec = useCallback(async () => {
    if (!specWriter) return
    const apiKey = getApiKey(specWriter.provider) || ''

    setIsGenerating(true)
    setContent('')
    setViewMode('preview')

    const userMessage = `Gere uma spec tecnica completa para o seguinte card:

Titulo: ${card.title}
Tipo: ${card.type}
Prioridade: ${card.priority}
Descricao: ${card.description || 'Sem descricao detalhada'}
${card.interview_notes ? `\nNotas da entrevista:\n${card.interview_notes}` : ''}
${card.project_id ? `\nProjeto: ${projects.find((p) => p.id === card.project_id)?.name || 'N/A'}` : ''}

Se voce tem acesso ao codigo-fonte, leia os arquivos mencionados para entender o contexto real antes de gerar a spec.`

    const enrichedConfig = {
      ...specWriter,
      system_prompt: buildSystemPrompt(),
    }

    const abort = new AbortController()
    abortRef.current = abort

    await runAgent(
      enrichedConfig,
      [{ id: 'user-msg', role: 'user', content: userMessage, timestamp: new Date().toISOString() }],
      apiKey,
      {
        onToken: (token) => setContent((prev) => prev + token),
        onComplete: (fullText) => {
          setContent(fullText)
          updateCard(card.id, { spec_content: fullText, spec_status: 'draft' })
          setIsGenerating(false)
        },
        onError: (error) => {
          setContent((prev) => prev + `\n\n[Erro: ${error}]`)
          setIsGenerating(false)
        },
      },
      abort.signal,
      getProjectPath(),
    )
  }, [specWriter, card, getApiKey, updateCard, projects, activeWorkspace])

  const handleUseTemplate = () => {
    const filled = SPEC_TEMPLATE.replace('{title}', card.title)
    setContent(filled)
    updateCard(card.id, { spec_content: filled, spec_status: 'draft' })
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }

  // Vault — only allow if persisted content matches local content (avoid saving stale/empty)
  const handleSaveToVault = () => {
    if (!content.trim()) {
      toast.error('Sem conteudo para salvar')
      return
    }
    // Persist current content first to ensure card.spec_content is in sync
    const refreshedSpec = content
    if (refreshedSpec !== card.spec_content) {
      updateCard(card.id, { spec_content: refreshedSpec, spec_status: card.spec_status || 'draft' })
    }
    const docId = createDocFromSpec({ ...card, spec_content: refreshedSpec }, workspaceId)
    if (docId) toast.success('Spec salva no Docs Vault')
    else toast.error('Falha ao salvar no Vault')
  }

  const navigate = useNavigate()
  const currentStatusMeta = SPEC_STATUSES.find((s) => s.value === currentStatus)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — compact: status + ações principais */}
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-wrap">
        {/* Status — discreet select with semantic */}
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Status</span>
            <Select value={currentStatus || 'draft'} onValueChange={(v) => handleStatusChange(v as SpecStatus)}>
              <SelectTrigger className="h-7 text-[11px] w-auto gap-1.5">
                <span className={`flex items-center gap-1.5 ${currentStatusMeta?.color || 'text-muted-foreground'}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {currentStatusMeta?.label || 'Rascunho'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {SPEC_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    <div className="flex flex-col">
                      <span className={s.color}>{s.label}</span>
                      <span className="text-[10px] text-muted-foreground">{s.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground/60 hover:text-foreground transition-colors">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-[11px]">
                <p className="mb-1 font-medium">Status da spec</p>
                <p className="text-muted-foreground">
                  Marca o estagio do trabalho. <strong>Rascunho</strong> = em escrita;
                  {' '}<strong>Pronta</strong> = aprovada para implementar;
                  {' '}<strong>Implementando/Review/Concluida</strong> sao gerenciados automaticamente
                  pelo painel Implementar.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <span className="h-5 w-px bg-border/60 mx-1" />

        {/* Generate / Template — ABORT lives inside the overlay during generation */}
        {!isGenerating && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleGenerateSpec}
              disabled={!specWriter}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Gerar com AI
            </Button>
            {specWriter && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-foreground transition-colors flex items-center gap-1">
                      <span>{specWriter.model}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-[11px]">
                    <p className="mb-1 font-medium">Spec Writer · {specWriter.provider}/{specWriter.model}</p>
                    <p className="text-muted-foreground mb-2">
                      Sem API key configurada, o agent roda via CLI local (claude-code/opencode/gemini-cli)
                      com fallback automatico.
                    </p>
                    <button
                      className="text-primary hover:underline flex items-center gap-1"
                      onClick={() => navigate('/settings')}
                    >
                      <Settings className="h-2.5 w-2.5" />
                      Configurar API key
                    </button>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleUseTemplate}>
              Template
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {getProjectPath() && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {projects.find((p) => p.path === getProjectPath())?.name || 'projeto'}
            </Badge>
          )}
          {card.spec_content?.trim() && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSaveToVault}
              title="Salvar spec atual como documento no Vault"
            >
              <BookOpen className="h-3.5 w-3.5 mr-1" />
              Vault
            </Button>
          )}
          {content.trim() && (
            <div className="flex rounded-md border overflow-hidden">
              <button
                className={`px-2 py-1 text-[11px] flex items-center gap-1 transition-colors ${viewMode === 'preview' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setViewMode('preview')}
              >
                <Eye className="h-3 w-3" />
                Preview
              </button>
              <button
                className={`px-2 py-1 text-[11px] flex items-center gap-1 transition-colors ${viewMode === 'edit' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setViewMode('edit')}
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>
            </div>
          )}
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {saved ? 'Salvo!' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Content: Generating / Preview / Editor */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {isGenerating ? (
          <SpecGenerationOverlay
            content={content}
            agentName={specWriter?.name || null}
            modelName={specWriter?.model || null}
            onAbort={handleCancel}
          />
        ) : (
          <div className="p-4 flex-1 flex flex-col overflow-y-auto">
            {viewMode === 'preview' && content.trim() ? (
              <div className="prose prose-sm dark:prose-invert max-w-none flex-1">
                <MessageResponse>{content}</MessageResponse>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva a spec aqui ou use o botao 'Gerar com AI'..."
                className="flex-1 resize-none font-mono text-sm"
                disabled={isGenerating}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
