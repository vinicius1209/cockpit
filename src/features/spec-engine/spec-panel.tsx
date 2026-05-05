import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { SpecGenerationOverlay } from './spec-generation-overlay'
import { toast } from 'sonner'
import { Sparkles, Save, Eye, Pencil, BookOpen, Settings, FileText, ArrowRight, Lock } from 'lucide-react'

// Note: spec status (draft/ready/in_progress/review/done) is now displayed
// in the pipeline tabs and in the sidebar Telemetria block. The transition
// draft → ready is exposed as a CTA in the toolbar; later transitions are
// managed by the Implement panel automatically.

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
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle')
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>(card.spec_content ? 'preview' : 'edit')
  const abortRef = useRef<AbortController | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedRef = useRef<string>(card.spec_content || '')

  // Auto-save: debounced 1.5s after last change. Only persists when content
  // differs from what's stored. Disabled while the agent is generating
  // (the generation flow has its own onComplete persistence).
  useEffect(() => {
    if (isGenerating) return
    if (content === lastPersistedRef.current) {
      // No diff — clear pending state
      if (autoSaveState === 'pending') setAutoSaveState('idle')
      return
    }
    setAutoSaveState('pending')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveState('saving')
      updateCard(card.id, {
        spec_content: content || null,
        spec_status: content.trim() ? (card.spec_status || 'draft') : null,
      })
      lastPersistedRef.current = content
      setAutoSaveState('saved')
      // Fade back to idle after 2s
      setTimeout(() => setAutoSaveState((s) => (s === 'saved' ? 'idle' : s)), 2000)
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [content, isGenerating, card.id, card.spec_status, updateCard, autoSaveState])

  // Sync local state if card.spec_content changes externally (e.g. agent finished)
  useEffect(() => {
    const incoming = card.spec_content || ''
    if (incoming !== lastPersistedRef.current && incoming !== content) {
      setContent(incoming)
      lastPersistedRef.current = incoming
    }
  }, [card.spec_content])

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
  const projectName = projects.find((p) => p.path === getProjectPath())?.name || null
  const hasContent = content.trim().length > 0
  const showReadyGate = hasContent && currentStatus === 'draft' && !isGenerating
  const showReadyBadge = currentStatus === 'ready' && !isGenerating

  return (
    <div className="flex flex-col h-full">
      {/* ── TOOLBAR — single line, semantic groups: GERACAO | TELEMETRIA | OUTPUT ── */}
      {!isGenerating && (
        <div className="flex items-center gap-2 px-3 py-2 border-b flex-wrap">
          {/* GERACAO */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerateSpec}
            disabled={!specWriter}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Gerar
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleUseTemplate}>
            <FileText className="h-3.5 w-3.5 mr-1" />
            Template
          </Button>

          {/* TELEMETRIA — info-only, mono small */}
          {specWriter && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 hover:text-foreground transition-colors">
                    <span>via</span>
                    <span className="text-foreground/80">{normalizeModelLabel(specWriter.model)}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>cli</span>
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
          {projectName && (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              <span className="text-muted-foreground/50">·</span>
              <span>proj:</span>
              <span className="text-foreground/80">{projectName}</span>
            </span>
          )}

          {/* OUTPUT — right-aligned */}
          <div className="ml-auto flex items-center gap-2">
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
            {hasContent && (
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
            <AutoSaveIndicator state={autoSaveState} />
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {saved ? 'Salvo!' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {/* ── READY GATE — banner entre etapas 3 e 4 ── */}
      {showReadyGate && (
        <div className="border-b border-blue-500/30 bg-blue-500/5 px-3 py-2 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-blue-500 flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            ━ READY GATE
          </span>
          <span className="text-[12px] text-foreground/80 flex-1">
            Spec em rascunho. Aprovar para destravar
            {' '}<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">[4] IMPLEMENTAR</span>?
          </span>
          <Button
            size="sm"
            className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white"
            onClick={() => {
              handleStatusChange('ready')
              toast.success('Spec marcada como Pronta', { description: 'Disponivel para implementacao' })
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white mr-1.5" />
            Marcar como pronta
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {/* ── READY BADGE — quando ja foi aprovada ── */}
      {showReadyBadge && (
        <div className="border-b border-blue-500/30 bg-blue-500/5 px-3 py-1.5 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-blue-500 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            ━ SPEC PRONTA
          </span>
          <span className="text-[11px] text-muted-foreground">
            Disponivel para implementar. Va para a aba
            {' '}<span className="font-mono uppercase tracking-[0.14em] text-foreground">[4] IMPLEMENTAR</span>.
          </span>
        </div>
      )}

      {/* ── CONTENT — generation overlay / empty state / preview / editor ── */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {isGenerating ? (
          <SpecGenerationOverlay
            content={content}
            agentName={specWriter?.name || null}
            modelName={specWriter?.model || null}
            onAbort={handleCancel}
          />
        ) : !hasContent ? (
          <SpecEmptyState
            onGenerate={handleGenerateSpec}
            onTemplate={handleUseTemplate}
            agentReady={!!specWriter}
            modelLabel={specWriter ? normalizeModelLabel(specWriter.model) : null}
          />
        ) : (
          <div className="p-4 flex-1 flex flex-col overflow-y-auto">
            {viewMode === 'preview' ? (
              <div className="prose prose-sm dark:prose-invert max-w-none flex-1">
                <MessageResponse>{content}</MessageResponse>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva a spec aqui ou use o botao 'Gerar'..."
                className="flex-1 resize-none font-mono text-sm"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Convert long Anthropic model IDs to the short tier label used in CLI fallback.
function normalizeModelLabel(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('sonnet')) return 'sonnet'
  if (lower.includes('haiku')) return 'haiku'
  if (lower.includes('opus')) return 'opus'
  return model
}

interface SpecEmptyStateProps {
  onGenerate: () => void
  onTemplate: () => void
  agentReady: boolean
  modelLabel: string | null
}

function SpecEmptyState({ onGenerate, onTemplate, agentReady, modelLabel }: SpecEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 text-center gap-5">
      {/* Header line — radar-style */}
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="h-px w-8 bg-border" />
        <span>AWAITING SPEC</span>
        <span className="h-px w-8 bg-border" />
      </div>

      {/* Big icon */}
      <div className="relative h-16 w-16">
        <span className="absolute inset-0 rounded-full border border-border" />
        <span className="absolute inset-2 rounded-full border border-border/60" />
        <span className="absolute inset-0 flex items-center justify-center">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </span>
      </div>

      <div className="space-y-1 max-w-sm">
        <p className="text-sm text-foreground">
          Ainda nao ha especificacao para este card.
        </p>
        <p className="text-xs text-muted-foreground">
          Sem spec, a etapa
          {' '}<span className="font-mono uppercase tracking-[0.14em]">[4] IMPLEMENTAR</span>
          {' '}fica bloqueada.
        </p>
      </div>

      {/* Two CTAs */}
      <div className="flex items-center gap-2">
        <Button onClick={onGenerate} disabled={!agentReady}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Gerar com AI
          {modelLabel && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] opacity-70">
              {modelLabel}
            </span>
          )}
        </Button>
        <Button variant="outline" onClick={onTemplate}>
          <FileText className="h-4 w-4 mr-1.5" />
          Usar Template
        </Button>
      </div>

      {/* Hint */}
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mt-2">
        ━ standby ━
      </p>
    </div>
  )
}

// Auto-save state indicator — sutil, mono, ao lado do botao Salvar.
function AutoSaveIndicator({ state }: { state: 'idle' | 'pending' | 'saving' | 'saved' }) {
  if (state === 'idle') return null
  const config = {
    pending: { dot: 'bg-muted-foreground/50',  label: 'editando…',     color: 'text-muted-foreground/60' },
    saving:  { dot: 'bg-amber-500 animate-pulse', label: 'salvando…',  color: 'text-amber-500' },
    saved:   { dot: 'bg-emerald-500',          label: 'auto-salvo',    color: 'text-emerald-500' },
  }[state]
  return (
    <span
      className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-opacity ${config.color}`}
      title="Spec eh salva automaticamente apos 1.5s sem digitar"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
