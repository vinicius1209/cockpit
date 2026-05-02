import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CARD_TYPES, CARD_PRIORITIES } from '@/entities/card/types'
import type { Card, CardType, CardPriority, Label as LabelType } from '@/entities/card/types'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import { useCardStore } from '@/entities/card/store'
import { useState, useEffect } from 'react'
import { Trash2, Plus, X, Tag, Bot, FileText, ScrollText, MessageSquare, BookOpen } from 'lucide-react'
import { AgentChat } from '@/features/agent-runner/agent-chat'
import { SpecPanel } from '@/features/spec-engine/spec-panel'
import { InterviewPanel } from '@/features/agent-runner/interview-panel'
import { useDocStore } from '@/entities/docs/store'

const LABEL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

type TabId = 'details' | 'interview' | 'spec' | 'agent'

interface CardDialogProps {
  card: Card | null
  open: boolean
  onClose: () => void
  defaultColumnId?: string
  workspaceId: string
}

export function CardDialog({ card, open, onClose, defaultColumnId, workspaceId }: CardDialogProps) {
  const { addCard, updateCard, deleteCard, getWorkspaceLabels, addLabel, toggleCardLabel } = useCardStore()
  const { getCardDocs } = useDocStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<CardType>('feature')
  const [priority, setPriority] = useState<CardPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [showNewLabel, setShowNewLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0])
  const [activeTab, setActiveTab] = useState<TabId>('details')

  const isEditing = !!card
  const workspaceLabels = getWorkspaceLabels(workspaceId)

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
    setShowNewLabel(false)
    setNewLabelName('')
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

  const handleCreateLabel = () => {
    if (!newLabelName.trim()) return
    const labelId = addLabel(workspaceId, newLabelName.trim(), newLabelColor)
    if (card) {
      const newLabel: LabelType = { id: labelId, workspace_id: workspaceId, name: newLabelName.trim(), color: newLabelColor }
      toggleCardLabel(card.id, newLabel)
    }
    setNewLabelName('')
    setShowNewLabel(false)
  }

  const isLabelActive = (labelId: string) => {
    return card?.labels.some((cl) => cl.label_id === labelId) ?? false
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={`${isEditing ? 'sm:max-w-3xl h-[85vh]' : 'sm:max-w-lg'} flex flex-col`}>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Card' : 'Novo Card'}</DialogTitle>
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
          <div className="space-y-4 pt-2 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label htmlFor="title">Titulo</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titulo do card..."
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descricao</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o problema ou tarefa..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as CardType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CARD_TYPE_CONFIG[t].bgColor} ${CARD_TYPE_CONFIG[t].color} border-0`}>
                            {CARD_TYPE_CONFIG[t].label}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as CardPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className={CARD_PRIORITY_CONFIG[p].color}>
                          {CARD_PRIORITY_CONFIG[p].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="due_date">Data limite</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignee">Responsavel</Label>
                <Input
                  id="assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Nome..."
                />
              </div>
            </div>

            {isEditing && card && (
              <>
                {/* Linked docs */}
                {(() => {
                  const linkedDocs = getCardDocs(card.id)
                  if (linkedDocs.length === 0) return null
                  return (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <BookOpen className="h-3.5 w-3.5" />
                          Documentos vinculados
                        </Label>
                        <div className="space-y-1">
                          {linkedDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/30 text-xs">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate flex-1">{doc.title}</span>
                              <Badge variant="outline" className="text-[9px]">{doc.source}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )
                })()}

                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" />
                      Labels
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setShowNewLabel(!showNewLabel)}
                    >
                      <Plus className="h-3 w-3 mr-0.5" />
                      Nova
                    </Button>
                  </div>

                  {showNewLabel && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        placeholder="Nome da label..."
                        className="h-8 text-sm flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateLabel()}
                      />
                      <div className="flex gap-1">
                        {LABEL_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`h-5 w-5 rounded-full shrink-0 transition-transform ${newLabelColor === c ? 'scale-125 ring-2 ring-offset-1 ring-offset-background ring-primary' : ''}`}
                            style={{ backgroundColor: c }}
                            onClick={() => setNewLabelColor(c)}
                          />
                        ))}
                      </div>
                      <Button size="sm" className="h-8" onClick={handleCreateLabel} disabled={!newLabelName.trim()}>
                        Criar
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {workspaceLabels.map((label) => {
                      const active = isLabelActive(label.id)
                      return (
                        <Badge
                          key={label.id}
                          variant={active ? 'default' : 'outline'}
                          className={`cursor-pointer text-xs transition-colors ${active ? 'text-white border-0' : 'opacity-60 hover:opacity-100'}`}
                          style={active ? { backgroundColor: label.color } : undefined}
                          onClick={() => card && toggleCardLabel(card.id, label)}
                        >
                          {!active && (
                            <span className="h-2 w-2 rounded-full mr-1 inline-block" style={{ backgroundColor: label.color }} />
                          )}
                          {label.name}
                          {active && <X className="h-3 w-3 ml-1" />}
                        </Badge>
                      )
                    })}
                    {workspaceLabels.length === 0 && !showNewLabel && (
                      <span className="text-xs text-muted-foreground">Nenhuma label criada</span>
                    )}
                  </div>
                </div>
              </>
            )}

          </div>
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
