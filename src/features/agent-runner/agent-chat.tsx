import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { useAgentStore } from '@/entities/agent/store'
import type { AgentMessage } from '@/entities/agent/types'
import { useProjectStore } from '@/entities/card/project-store'
import { runAgent } from './agent-service'
import type { Card } from '@/entities/card/types'
import { Send, Square, Bot, Loader2, AlertCircle, Plus, MessageSquare } from 'lucide-react'

interface AgentChatProps {
  card: Card
  workspaceId: string
}

// Builds the agent's system prompt enriched with full card+project context.
// The agent must respond ONLY within the scope of this card/project.
//
// Strategy: agent's original system_prompt + restrictive scope rules +
// full card snapshot (description, interview, spec) + project info.
// Sent ONCE in system_prompt → no token duplication across turns.
function buildEnrichedSystemPrompt(
  baseSystemPrompt: string,
  card: Card,
  project: { name: string; path: string } | null,
): string {
  const sections: string[] = []

  // 1. Original agent prompt
  if (baseSystemPrompt?.trim()) {
    sections.push(baseSystemPrompt.trim())
  }

  // 2. SCOPE — restrict the agent to this card/project context
  sections.push(`## Escopo da conversa

Voce esta conversando sobre UM card especifico de um projeto. Sua atuacao deve
ficar restrita ao escopo deste card e do projeto vinculado.

- Responda APENAS perguntas relacionadas a este card ou ao projeto.
- Se o usuario perguntar algo fora desse escopo, redirecione gentilmente.
- NAO faca perguntas sobre informacoes que ja estao no contexto abaixo.
- Use ativamente o contexto: titulo, descricao, entrevista, spec, projeto.`)

  // 3. CARD snapshot
  const cardLines: string[] = ['## Contexto do card']
  cardLines.push(`- Titulo: ${card.title}`)
  cardLines.push(`- Tipo: ${card.type}`)
  cardLines.push(`- Prioridade: ${card.priority}`)
  if (card.assignee) cardLines.push(`- Responsavel: ${card.assignee}`)
  if (card.due_date) cardLines.push(`- Data limite: ${card.due_date}`)
  if (card.description?.trim()) {
    cardLines.push('')
    cardLines.push('### Descricao')
    cardLines.push(card.description.trim())
  }
  if (card.interview_notes?.trim()) {
    cardLines.push('')
    cardLines.push('### Notas da entrevista')
    cardLines.push(card.interview_notes.trim())
  }
  if (card.spec_content?.trim()) {
    cardLines.push('')
    cardLines.push(`### Spec (status: ${card.spec_status || 'rascunho'})`)
    const spec = card.spec_content.trim()
    cardLines.push(spec.length > 3000 ? spec.slice(0, 3000) + '\n\n…[truncada]' : spec)
  }
  sections.push(cardLines.join('\n'))

  // 4. PROJECT snapshot
  if (project) {
    sections.push(`## Projeto vinculado

- Nome: ${project.name}
- Path: ${project.path}

Voce tem acesso ao codigo-fonte deste projeto via filesystem (cwd ja apontando
para o path acima). Pode ler arquivos para responder com mais precisao.`)
  }

  return sections.join('\n\n')
}

export function AgentChat({ card, workspaceId }: AgentChatProps) {
  const {
    getWorkspaceAgents,
    getApiKey,
    createRun,
    addMessage,
    updateRunStatus,
    getCardRuns,
    getRun,
  } = useAgentStore()

  const { getWorkspaceProjects } = useProjectStore()
  const agents = getWorkspaceAgents(workspaceId)
  const cardRuns = getCardRuns(card.id)
  const projects = getWorkspaceProjects(workspaceId)
  const projectPath = card.project_id ? projects.find((p) => p.id === card.project_id)?.path : projects[0]?.path

  // Default agent for AI Chat: prefer analyzer (best for free conversation),
  // then any non-interviewer (interviewer is meant for the dedicated Entrevista
  // tab and ignores context to ask questions from zero).
  const enabledAgents = agents.filter((a) => a.enabled)
  const defaultAgent =
    enabledAgents.find((a) => a.role === 'analyzer') ||
    enabledAgents.find((a) => a.role !== 'interviewer') ||
    enabledAgents[0]
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgent?.id || '')
  const [activeRunId, setActiveRunId] = useState<string | null>(cardRuns[0]?.id || null)
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const activeRun = activeRunId ? getRun(activeRunId) : null
  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedAgent || isStreaming) return

    const apiKey = getApiKey(selectedAgent.provider) || ''

    let runId = activeRunId
    if (!runId || activeRun?.status !== 'running') {
      runId = createRun(selectedAgent.id, card.id, workspaceId)
      setActiveRunId(runId)
    }

    const userMessage = input.trim()
    setInput('')
    addMessage(runId, { role: 'user', content: userMessage })

    setIsStreaming(true)
    setStreamingText('')

    const currentRun = getRun(runId)
    const allMessages = currentRun?.messages || []

    // Contexto do card + projeto vai no SYSTEM PROMPT do agente (e nao nas
    // messages, que sao filtradas em agent-service). Assim:
    // 1. Nao gasta tokens duplicando em cada turno
    // 2. Sobrevive a multiplas mensagens
    // 3. Inclui escopo restritivo: agent so responde sobre card+projeto
    const project = card.project_id
      ? projects.find((p) => p.id === card.project_id) ?? null
      : projects[0] ?? null
    const enrichedConfig = {
      ...selectedAgent,
      system_prompt: buildEnrichedSystemPrompt(selectedAgent.system_prompt, card, project),
    }
    const messagesForApi: AgentMessage[] = allMessages

    const abort = new AbortController()
    abortRef.current = abort

    await runAgent(
      enrichedConfig,
      messagesForApi,
      apiKey,
      {
        onToken: (token) => setStreamingText((prev) => prev + token),
        onComplete: (fullText) => {
          addMessage(runId!, { role: 'assistant', content: fullText })
          setStreamingText('')
          setIsStreaming(false)
        },
        onError: (error) => {
          updateRunStatus(runId!, 'error', undefined, error)
          setStreamingText('')
          setIsStreaming(false)
        },
      },
      abort.signal,
      projectPath,
    )
  }, [input, selectedAgent, isStreaming, activeRunId, activeRun, card, workspaceId, getApiKey, createRun, addMessage, getRun, updateRunStatus, projectPath])

  const handleCancel = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setStreamingText('')
    if (activeRunId) {
      updateRunStatus(activeRunId, 'cancelled')
    }
  }

  const handleNewChat = () => {
    setActiveRunId(null)
    setStreamingText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder="Selecionar agent..." />
          </SelectTrigger>
          <SelectContent>
            {agents.filter((a) => a.enabled).map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                <div className="flex items-center gap-2">
                  <span>{agent.name}</span>
                  <Badge variant="outline" className="text-[10px]">{agent.role}</Badge>
                  {agent.role === 'interviewer' && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-amber-500/80" title="Otimizado para a aba Entrevista — pode ignorar contexto em chat livre">
                      ENTREVISTA
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeRunId && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleNewChat} title="Iniciar nova conversa com o agent selecionado">
            <Plus className="h-3.5 w-3.5" />
            Nova conversa
          </Button>
        )}
      </div>

      {/* Run history tabs */}
      {cardRuns.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b overflow-x-auto">
          <span className="text-[10px] text-muted-foreground shrink-0 mr-0.5">Conversas:</span>
          {cardRuns.slice(0, 5).map((run, i) => {
            const agent = agents.find((a) => a.id === run.agent_id)
            const isActive = activeRunId === run.id
            return (
              <button
                key={run.id}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] shrink-0 transition-colors ${
                  isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                onClick={() => setActiveRunId(run.id)}
              >
                <MessageSquare className="h-3 w-3" />
                {agent?.name || 'Agent'} #{cardRuns.length - i}
                <span className="opacity-60">· {run.messages.length}msg</span>
                {run.status === 'error' && <AlertCircle className="h-3 w-3 text-destructive" />}
              </button>
            )
          })}
        </div>
      )}

      {/* Messages */}
      {!activeRun && !isStreaming ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Bot className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">Chat com AI Agent</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Selecione um agent e envie uma mensagem. O contexto do card sera enviado automaticamente.
          </p>
        </div>
      ) : (
        <Conversation className="flex-1 bg-muted/10">
          <ConversationContent className="gap-6 px-4 py-4">
            {activeRun?.messages.map((msg) => (
              <Message key={msg.id} from={msg.role}>
                <MessageContent>
                  {msg.role === 'assistant' ? (
                    <MessageResponse>{msg.content}</MessageResponse>
                  ) : (
                    <p className="whitespace-pre-wrap text-pretty">{msg.content}</p>
                  )}
                </MessageContent>
              </Message>
            ))}

            {/* Thinking indicator */}
            {isStreaming && !streamingText && (
              <Message from="assistant">
                <MessageContent>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Pensando...</span>
                  </div>
                </MessageContent>
              </Message>
            )}

            {/* Streaming message with cursor */}
            {streamingText && (
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>{streamingText}</MessageResponse>
                  <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse" />
                </MessageContent>
              </Message>
            )}

            {/* Error */}
            {activeRun?.status === 'error' && activeRun.error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {activeRun.error}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input */}
      <div className="border-t bg-background">
        {isStreaming ? (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Agent respondendo...</span>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancel}>
              <Square className="h-3 w-3 mr-1" />
              Parar
            </Button>
          </div>
        ) : (
        <div className="p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mensagem para o agent..."
            rows={2}
            className="resize-none text-sm min-h-[44px]"
          />
          <span className="hidden" /> {/* placeholder for old ternary */}
            <Button size="icon" className="h-[44px] w-[44px] shrink-0 rounded-lg" onClick={handleSend} disabled={!input.trim() || !selectedAgent}>
              <Send className="h-4 w-4" />
            </Button>
        </div>
        </div>
        )}
      </div>
    </div>
  )
}
