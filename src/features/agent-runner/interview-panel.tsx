import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { useCardStore } from '@/entities/card/store'
import { runAgent } from './agent-service'
import type { Card } from '@/entities/card/types'
import type { AgentMessage } from '@/entities/agent/types'
import { Send, Square, Bot, Loader2, Save, MessageSquare } from 'lucide-react'

interface InterviewPanelProps {
  card: Card
  workspaceId: string
}

export function InterviewPanel({ card, workspaceId }: InterviewPanelProps) {
  const { getWorkspaceAgents, getApiKey } = useAgentStore()
  const { updateCard } = useCardStore()

  const interviewer = getWorkspaceAgents(workspaceId).find((a) => a.role === 'interviewer')

  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const startInterview = useCallback(async () => {
    if (!interviewer) return
    const apiKey = getApiKey(interviewer.provider) || ''

    const initialMessage: AgentMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `Inicie a entrevista para refinar o seguinte card:

Titulo: ${card.title}
Tipo: ${card.type}
Prioridade: ${card.priority}
Descricao: ${card.description || 'Sem descricao detalhada'}

Faca a primeira pergunta para entender melhor esse card.`,
      timestamp: new Date().toISOString(),
    }

    setMessages([initialMessage])
    setIsStreaming(true)
    setStreamingText('')
    setIsComplete(false)

    const abort = new AbortController()
    abortRef.current = abort

    await runAgent(
      interviewer,
      [initialMessage],
      apiKey,
      {
        onToken: (token) => setStreamingText((prev) => prev + token),
        onComplete: (fullText) => {
          const assistantMsg: AgentMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: fullText,
            timestamp: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, assistantMsg])
          setStreamingText('')
          setIsStreaming(false)
          if (fullText.includes('ENTREVISTA COMPLETA')) {
            setIsComplete(true)
          }
        },
        onError: () => {
          setStreamingText('')
          setIsStreaming(false)
        },
      },
      abort.signal,
    )
  }, [interviewer, card, getApiKey])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !interviewer || isStreaming) return

    const apiKey = getApiKey(interviewer.provider) || ''

    const userMsg: AgentMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsStreaming(true)
    setStreamingText('')

    const abort = new AbortController()
    abortRef.current = abort

    await runAgent(
      interviewer,
      newMessages,
      apiKey,
      {
        onToken: (token) => setStreamingText((prev) => prev + token),
        onComplete: (fullText) => {
          const assistantMsg: AgentMessage = {
            id: `msg-${Date.now()}-r`,
            role: 'assistant',
            content: fullText,
            timestamp: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, assistantMsg])
          setStreamingText('')
          setIsStreaming(false)
          if (fullText.includes('ENTREVISTA COMPLETA')) {
            setIsComplete(true)
          }
        },
        onError: () => {
          setStreamingText('')
          setIsStreaming(false)
        },
      },
      abort.signal,
    )
  }, [input, interviewer, isStreaming, messages, getApiKey])

  const handleCancel = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setStreamingText('')
  }

  const handleSaveNotes = () => {
    const notes = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join('\n\n---\n\n')
    updateCard(card.id, { interview_notes: notes })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasStarted = messages.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Modo Entrevista</span>
        {interviewer && (
          <Badge variant="outline" className="text-[10px]">{interviewer.name}</Badge>
        )}
        {hasStarted && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSaveNotes}>
            <Save className="h-3.5 w-3.5 mr-1" />
            Salvar notas
          </Button>
        )}
      </div>

      {card.interview_notes && !hasStarted && (
        <div className="px-4 py-2 border-b bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Notas salvas da entrevista anterior:</p>
          <p className="text-xs line-clamp-3 whitespace-pre-wrap">{card.interview_notes}</p>
        </div>
      )}

      {/* Messages */}
      {!hasStarted ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">Refine este card com a AI</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">
            O agent fara perguntas para detalhar requisitos, edge cases e criterios de aceite.
          </p>
          <Button onClick={startInterview} disabled={!interviewer}>
            <Bot className="h-4 w-4 mr-2" />
            Iniciar Entrevista
          </Button>
        </div>
      ) : (
        <Conversation className="flex-1 bg-muted/10">
          <ConversationContent className="gap-6 px-4 py-4">
            {/* Context banner (first message) */}
            {messages.length > 0 && messages[0].role === 'user' && (
              <div className="text-center">
                <Badge variant="secondary" className="text-[10px]">
                  Contexto do card enviado automaticamente
                </Badge>
              </div>
            )}

            {messages.filter((m) => m.role !== 'system').map((msg, idx) => {
              // Skip first user message (context) - show as banner above
              if (idx === 0 && msg.role === 'user') return null

              return (
                <Message key={msg.id} from={msg.role}>
                  <MessageContent>
                    {msg.role === 'assistant' ? (
                      <MessageResponse>{msg.content}</MessageResponse>
                    ) : (
                      <p className="whitespace-pre-wrap text-pretty">{msg.content}</p>
                    )}
                  </MessageContent>
                </Message>
              )
            })}

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

            {/* Completion banner */}
            {isComplete && (
              <div className="text-center space-y-2">
                <Badge className="bg-green-600 text-white">Entrevista Completa</Badge>
                <p className="text-xs text-muted-foreground">
                  Clique em "Salvar notas" e depois gere a spec.
                </p>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input */}
      {hasStarted && (
        <div className="border-t bg-background p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sua resposta..."
              rows={2}
              className="resize-none text-sm min-h-[44px]"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button variant="destructive" size="icon" className="h-[44px] w-[44px] shrink-0 rounded-lg" onClick={handleCancel}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" className="h-[44px] w-[44px] shrink-0 rounded-lg" onClick={handleSend} disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
