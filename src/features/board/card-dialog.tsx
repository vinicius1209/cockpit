import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Card, CardType, CardPriority } from '@/entities/card/types'
import { useCardStore, type ProcessingState } from '@/entities/card/store'
import { useState, useEffect } from 'react'
import { Trash2, Bot, FileText, ScrollText, MessageSquare, Rocket, Loader2 } from 'lucide-react'
import { AgentChat } from '@/features/agent-runner/agent-chat'
import { SpecPanel } from '@/features/spec-engine/spec-panel'
import { InterviewPanel } from '@/features/agent-runner/interview-panel'
import { ImplementPanel } from '@/features/implement/implement-panel'
import { CardDetailsPanel } from './card-details-panel'

type TabId = 'details' | 'interview' | 'spec' | 'implement' | 'agent'

interface CardDialogProps {
  card: Card | null
  open: boolean
  onClose: () => void
  defaultColumnId?: string
  workspaceId: string
}

export function CardDialog({ card, open, onClose, defaultColumnId, workspaceId }: CardDialogProps) {
  const { addCard, updateCard, deleteCard } = useCardStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<CardType>('feature')
  const [priority, setPriority] = useState<CardPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('details')

  const isEditing = !!card
  const processing = useCardStore((s) => card ? s.processingCards[card.id] : undefined) as ProcessingState | undefined

  useEffect(() => {
    if (card) {
      setTitle(card.title)
      setDescription(card.description || '')
      setType(card.type)
      setPriority(card.priority)
      setDueDate(card.due_date || '')
      setAssignee(card.assignee || '')
    } else {
      setTitle('')
      setDescription('')
      setType('feature')
      setPriority('medium')
      setDueDate('')
      setAssignee('')
      setActiveTab('details')
    }
  }, [card, open])

  const handleSave = () => {
    if (!title.trim()) return

    if (isEditing && card) {
      updateCard(card.id, {
        title: title.trim(),
        description: description.trim() || null,
        type,
        priority,
        due_date: dueDate || null,
        assignee: assignee.trim() || null,
      })
    } else {
      const columns = useCardStore.getState().getWorkspaceColumns(workspaceId)
      const columnId = defaultColumnId || columns[0]?.id
      if (!columnId) return

      const cardsInColumn = useCardStore.getState().getColumnCards(workspaceId, columnId)
      addCard({
        workspace_id: workspaceId,
        column_id: columnId,
        project_id: null,
        title: title.trim(),
        description: description.trim() || null,
        type,
        priority,
        position: cardsInColumn.length,
        assignee: assignee.trim() || null,
        due_date: dueDate || null,
        spec_status: null,
        spec_content: null,
        interview_notes: null,
        interview_messages: null,
      })
    }
    onClose()
  }

  const handleDelete = () => {
    if (card) {
      deleteCard(card.id)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`sm:max-w-3xl ${isEditing ? 'h-[85vh]' : 'h-auto'} flex flex-col`}>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Card' : 'Novo Card'}</DialogTitle>

          {/* Processing banner */}
          {processing && (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 mt-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-amber-500">
                  {processing.action === 'discovery' ? 'Agent analisando card...' :
                   processing.action === 'spec' ? 'Gerando especificacao...' :
                   'Processando...'}
                </span>
                {processing.chunks.length > 0 && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {processing.chunks[processing.chunks.length - 1]}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{processing.chunks.length} chunks</span>
            </div>
          )}

          {isEditing && (
            <div className="flex gap-1 pt-1">
              <Button
                variant={activeTab === 'details' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveTab('details')}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Detalhes
              </Button>
              <Button
                variant={activeTab === 'interview' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveTab('interview')}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                Entrevista
              </Button>
              <Button
                variant={activeTab === 'spec' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveTab('spec')}
              >
                <ScrollText className="h-3.5 w-3.5 mr-1" />
                Spec
                {card?.spec_status && (
                  <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">{card.spec_status}</Badge>
                )}
              </Button>
              {card?.spec_content && (card?.spec_status === 'ready' || card?.spec_status === 'in_progress' || card?.spec_status === 'review') && (
                <Button
                  variant={activeTab === 'implement' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setActiveTab('implement')}
                >
                  <Rocket className="h-3.5 w-3.5 mr-1" />
                  Implementar
                </Button>
              )}
              <Button
                variant={activeTab === 'agent' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveTab('agent')}
              >
                <Bot className="h-3.5 w-3.5 mr-1" />
                AI Agent
              </Button>
            </div>
          )}
        </DialogHeader>

        {activeTab === 'details' ? (
          <CardDetailsPanel
            card={card}
            isEditing={isEditing}
            workspaceId={workspaceId}
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            type={type} setType={setType}
            priority={priority} setPriority={setPriority}
            dueDate={dueDate} setDueDate={setDueDate}
            assignee={assignee} setAssignee={setAssignee}
            disabled={!!processing}
          />
        ) : null}

        {/* Keep panels mounted but hidden to preserve state across tab switches */}
        {isEditing && card && (
          <>
            <div className={`flex-1 min-h-0 overflow-hidden ${activeTab === 'interview' ? 'flex flex-col' : 'hidden'}`}>
              <InterviewPanel card={card} workspaceId={workspaceId} />
            </div>
            <div className={`flex-1 min-h-0 overflow-hidden ${activeTab === 'spec' ? 'flex flex-col' : 'hidden'}`}>
              <SpecPanel card={card} workspaceId={workspaceId} />
            </div>
            <div className={`flex-1 min-h-0 overflow-hidden ${activeTab === 'implement' ? 'flex flex-col' : 'hidden'}`}>
              <ImplementPanel card={card} workspaceId={workspaceId} />
            </div>
            <div className={`flex-1 min-h-0 overflow-hidden ${activeTab === 'agent' ? 'flex flex-col' : 'hidden'}`}>
              <AgentChat card={card} workspaceId={workspaceId} />
            </div>
          </>
        )}

        {/* Footer — fixed at bottom */}
        <div className="flex items-center justify-between border-t pt-3 shrink-0">
          {isEditing ? (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Excluir
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!title.trim()}>
              {isEditing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
