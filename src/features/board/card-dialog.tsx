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
import { CARD_TYPES, CARD_PRIORITIES } from '@/entities/card/types'
import type { Card, CardType, CardPriority } from '@/entities/card/types'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import { useCardStore } from '@/entities/card/store'
import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'

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

  const isEditing = !!card

  useEffect(() => {
    if (card) {
      setTitle(card.title)
      setDescription(card.description || '')
      setType(card.type)
      setPriority(card.priority)
      setDueDate(card.due_date || '')
    } else {
      setTitle('')
      setDescription('')
      setType('feature')
      setPriority('medium')
      setDueDate('')
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
        assignee: null,
        due_date: dueDate || null,
        spec_status: null,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Card' : 'Novo Card'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
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

          <div className="space-y-2">
            <Label htmlFor="due_date">Data limite</Label>
            <Input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {isEditing && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
            )}
            <div className={`flex gap-2 ${!isEditing ? 'ml-auto' : ''}`}>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!title.trim()}>
                {isEditing ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
