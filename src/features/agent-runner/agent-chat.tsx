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
import { runAgent } from './agent-service'
import type { Card } from '@/entities/card/types'
import { Send, Square, Bot, Loader2, AlertCircle } from 'lucide-react'

interface AgentChatProps {
  card: Card
  workspaceId: string
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

  const agents = getWorkspaceAgents(workspaceId)
  const cardRuns = getCardRuns(card.id)

  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || '')
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
    const allMessages = [
      ...(currentRun?.messages || []),
      { id: 'temp', role: 'user' as const, content: userMessage, timestamp: new Date().toISOString() },
    ]

    const contextPrefix = allMessages.filter((m) => m.role === 'user').length === 1
      ? `[Contexto do Card]\nTitulo: ${card.title}\nTipo: ${card.type}\nPrioridade: ${card.priority}\nDescricao: ${card.description || 'Sem descricao'}\n\n[Mensagem]\n`
      : ''

    const messagesForApi = allMessages.map((m, i) => ({
      ...m,
      content: i === allMessages.length - 1 && contextPrefix ? contextPrefix + m.content : m.content,
    }))

    const abort = new AbortController()
    abortRef.current = abort

    await runAgent(
      selectedAgent,
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
    )
  }, [input, selectedAgent, isStreaming, activeRunId, activeRun, card, workspaceId, getApiKey, createRun, addMessage, getRun, updateRunStatus])

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
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleNewChat}>
          Novo
        </Button>
      </div>

      {/* Run history tabs */}
      {cardRuns.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b overflow-x-auto">
          {cardRuns.slice(0, 5).map((run) => {
            const agent = agents.find((a) => a.id === run.agent_id)
            return (
              <Badge
                key={run.id}
                variant={activeRunId === run.id ? 'default' : 'outline'}
                className="cursor-pointer text-[10px] shrink-0"
                onClick={() => setActiveRunId(run.id)}
              >
                {agent?.name || 'Agent'} · {run.messages.length}msg
                {run.status === 'error' && <AlertCircle className="h-3 w-3 ml-0.5 text-destructive" />}
              </Badge>
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

            {/* Streaming message */}
            {streamingText && (
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>{streamingText}</MessageResponse>
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
      <div className="border-t bg-background p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mensagem para o agent..."
            rows={2}
            className="resize-none text-sm min-h-[44px]"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button variant="destructive" size="icon" className="h-[44px] w-[44px] shrink-0 rounded-lg" onClick={handleCancel}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" className="h-[44px] w-[44px] shrink-0 rounded-lg" onClick={handleSend} disabled={!input.trim() || !selectedAgent}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
