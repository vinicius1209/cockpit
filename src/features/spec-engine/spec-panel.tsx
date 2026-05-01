import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCardStore } from '@/entities/card/store'
import { useAgentStore } from '@/entities/agent/store'
import { runAgent } from '@/features/agent-runner/agent-service'
import type { Card, SpecStatus } from '@/entities/card/types'
import { Sparkles, Save, Loader2, ChevronRight } from 'lucide-react'

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

  const [content, setContent] = useState(card.spec_content || '')
  const [isGenerating, setIsGenerating] = useState(false)
  const [saved, setSaved] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const currentStatus = card.spec_status
  const specWriter = getWorkspaceAgents(workspaceId).find((a) => a.role === 'spec-writer')

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
    const apiKey = getApiKey(specWriter.provider)
    if (!apiKey) {
      alert(`Configure a API key do provider "${specWriter.provider}" nas configuracoes.`)
      return
    }

    setIsGenerating(true)
    setContent('')

    const userMessage = `Gere uma spec tecnica completa para o seguinte card:

Titulo: ${card.title}
Tipo: ${card.type}
Prioridade: ${card.priority}
Descricao: ${card.description || 'Sem descricao detalhada'}

${card.interview_notes ? `Notas da entrevista:\n${card.interview_notes}` : ''}`

    const abort = new AbortController()
    abortRef.current = abort

    await runAgent(
      specWriter,
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
    )
  }, [specWriter, card, getApiKey, updateCard])

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
        <div className="ml-auto">
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {saved ? 'Salvo!' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva a spec aqui ou use o botao 'Gerar com AI'..."
            className="min-h-[400px] resize-none font-mono text-sm"
            disabled={isGenerating}
          />
        </div>
      </ScrollArea>
    </div>
  )
}
