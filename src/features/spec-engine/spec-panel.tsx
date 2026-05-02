import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useCardStore } from '@/entities/card/store'
import { useAgentStore } from '@/entities/agent/store'
import { useProjectStore } from '@/entities/card/project-store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { runAgent } from '@/features/agent-runner/agent-service'
import type { Card, SpecStatus } from '@/entities/card/types'
import { MessageResponse } from '@/components/ai-elements/message'
import { Sparkles, Save, Loader2, ChevronRight, Eye, Pencil } from 'lucide-react'

const SPEC_STEPS: { status: SpecStatus; label: string; color: string }[] = [
  { status: 'draft', label: 'Rascunho', color: '#f59e0b' },
  { status: 'ready', label: 'Pronta', color: '#3b82f6' },
  { status: 'in_progress', label: 'Implementando', color: '#8b5cf6' },
  { status: 'review', label: 'Review', color: '#ec4899' },
  { status: 'done', label: 'Concluida', color: '#10b981' },
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

  return (
    <div className="flex flex-col h-full">
      {/* Status timeline */}
      <div className="flex items-center gap-1 px-3 py-2.5 border-b">
        {SPEC_STEPS.map((step, i) => {
          const isActive = currentStatus === step.status
          const isPast = currentStatus ? SPEC_STEPS.findIndex((s) => s.status === currentStatus) > i : false
          return (
            <div key={step.status} className="flex items-center">
              <Badge
                variant={isActive ? 'default' : 'outline'}
                className={`cursor-pointer text-[10px] px-2 py-0.5 transition-colors ${
                  isActive ? 'text-white border-0' : isPast ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                }`}
                style={isActive ? { backgroundColor: step.color } : undefined}
                onClick={() => handleStatusChange(step.status)}
              >
                {step.label}
              </Badge>
              {i < SPEC_STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        {isGenerating ? (
          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleCancel}>
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            Cancelar
          </Button>
        ) : (
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
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleUseTemplate}>
              Template
            </Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {getProjectPath() && (
            <Badge variant="outline" className="text-[10px]">
              {projects.find((p) => p.path === getProjectPath())?.name || 'projeto'}
            </Badge>
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

      {/* Content: Preview or Editor */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <div className="p-4 flex-1 flex flex-col">
          {viewMode === 'preview' && content.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
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
      </div>
    </div>
  )
}
