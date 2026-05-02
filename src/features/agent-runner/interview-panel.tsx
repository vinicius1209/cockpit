import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useAgentStore } from '@/entities/agent/store'
import { useCardStore } from '@/entities/card/store'
import { runAgent } from './agent-service'
import type { Card } from '@/entities/card/types'
import type { AgentMessage } from '@/entities/agent/types'
import { Send, Square, Bot, User, Loader2, Save, MessageSquare } from 'lucide-react'

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
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

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
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
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
        <div className="px-3 py-2 border-b bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Notas salvas da entrevista anterior:</p>
          <p className="text-xs line-clamp-3 whitespace-pre-wrap">{card.interview_notes}</p>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        <div className="space-y-3">
          {!hasStarted && (
            <div className="text-center py-8">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">O agent fara perguntas para refinar este card.</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">As respostas serao usadas para gerar uma spec mais completa.</p>
              <Button onClick={startInterview} disabled={!interviewer}>
                Iniciar Entrevista
              </Button>
            </div>
          )}

          {messages.filter((m) => m.role !== 'system').map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={`rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.role === 'user' && messages.indexOf(msg) === 0
                  ? '(Contexto do card enviado automaticamente)'
                  : msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))}

          {streamingText && (
            <div className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="rounded-lg px-3 py-2 text-sm max-w-[85%] bg-muted whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-primary/50 animate-pulse ml-0.5" />
              </div>
            </div>
          )}

          {isComplete && (
            <div className="text-center py-2">
              <Badge className="bg-green-600 text-white">Entrevista Completa</Badge>
              <p className="text-xs text-muted-foreground mt-2">Clique em "Salvar notas" para guardar no card, depois gere a spec.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      {hasStarted && (
        <div className="p-3 border-t">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sua resposta..."
              rows={2}
              className="resize-none text-sm"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button variant="destructive" size="icon" className="h-9 w-9 shrink-0" onClick={handleCancel}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!input.trim()}>
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
