import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { useProjectStore } from '@/entities/card/project-store'
import type { Card } from '@/entities/card/types'
import type { AgentMessage } from '@/entities/agent/types'
import { Send, Square, Bot, Loader2, Save, MessageSquare, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface InterviewPanelProps {
  card: Card
  workspaceId: string
}

export function InterviewPanel({ card, workspaceId }: InterviewPanelProps) {
  const { getWorkspaceAgents, getApiKey } = useAgentStore()
  const { updateCard } = useCardStore()
  const { getWorkspaceProjects } = useProjectStore()

  const interviewer = getWorkspaceAgents(workspaceId).find((a) => a.role === 'interviewer')
  const projects = getWorkspaceProjects(workspaceId)
  const projectPath = card.project_id ? projects.find((p) => p.id === card.project_id)?.path : projects[0]?.path

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
            handleSaveNotesAuto([...messages, initialMessage, assistantMsg])
          }
        },
        onError: () => {
          setStreamingText('')
          setIsStreaming(false)
        },
      },
      abort.signal,
      projectPath,
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
            handleSaveNotesAuto([...newMessages, assistantMsg])
          }
        },
        onError: () => {
          setStreamingText('')
          setIsStreaming(false)
        },
      },
      abort.signal,
      projectPath,
    )
  }, [input, interviewer, isStreaming, messages, getApiKey])

  const handleCancel = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setStreamingText('')
  }

  const handleSaveNotesAuto = (msgs: AgentMessage[]) => {
    const notes = msgs
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join('\n\n---\n\n')
    if (notes.trim()) {
      updateCard(card.id, { interview_notes: notes })
      toast.success('Notas da entrevista salvas automaticamente')
    }
  }

  const handleSaveNotes = () => {
    const notes = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join('\n\n---\n\n')
    updateCard(card.id, { interview_notes: notes })
    toast.success('Notas salvas')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasStarted = messages.length > 0
  const messageCount = messages.filter((m) => m.role !== 'system' && !(messages.indexOf(m) === 0 && m.role === 'user')).length

  return (
    <div className="flex flex-col h-full">
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

          {card.interview_notes && (
            <p className="text-[11px] text-muted-foreground mb-3 px-4 py-2 bg-muted/30 rounded-md max-w-sm">
              Ja existe notas salvas de uma entrevista anterior. Iniciar nova vai substituir.
            </p>
          )}

          <Button onClick={startInterview} disabled={!interviewer}>
            <Bot className="h-4 w-4 mr-2" />
            Iniciar Entrevista
          </Button>
        </div>
      ) : (
        <Conversation className="flex-1 bg-muted/10">
          <ConversationContent className="gap-5 px-4 py-4">
            {messages.filter((m) => m.role !== 'system').map((msg, idx) => {
              // Skip first user message (context)
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
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-500">Entrevista Completa</p>
                  <p className="text-xs text-muted-foreground">Notas salvas automaticamente. Va para a aba Spec para gerar a especificacao.</p>
                </div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input area */}
      {hasStarted && (
        <div className="border-t bg-background">
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-b bg-muted/20">
            <span className="text-[11px] text-muted-foreground">
              {messageCount} mensagen{messageCount !== 1 ? 's' : ''}
              {isComplete && ' · Completa'}
            </span>
            {!isComplete && hasStarted && messages.filter((m) => m.role === 'assistant').length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={handleSaveNotes}>
                <Save className="h-3 w-3 mr-1" />
                Salvar notas
              </Button>
            )}
          </div>

          {/* Input */}
          <div className="p-3">
            {isStreaming ? (
              <div className="flex items-center justify-between">
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
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isComplete ? 'Entrevista concluida. Faca mais perguntas se necessario...' : 'Sua resposta...'}
                  rows={2}
                  className="resize-none text-sm min-h-[44px]"
                />
                <Button size="icon" className="h-[44px] w-[44px] shrink-0 rounded-lg" onClick={handleSend} disabled={!input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
