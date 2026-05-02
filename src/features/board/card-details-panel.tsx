import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CARD_TYPES, CARD_PRIORITIES } from '@/entities/card/types'
import type { Card, CardType, CardPriority, Label as LabelType } from '@/entities/card/types'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import { useCardStore } from '@/entities/card/store'
import { useDocStore } from '@/entities/docs/store'
import { useState } from 'react'
import { Plus, X, FileText, BookOpen, User, Bot } from 'lucide-react'

const LABEL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

interface CardDetailsPanelProps {
  card: Card | null
  isEditing: boolean
  workspaceId: string
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  type: CardType
  setType: (v: CardType) => void
  priority: CardPriority
  setPriority: (v: CardPriority) => void
  dueDate: string
  setDueDate: (v: string) => void
  assignee: string
  setAssignee: (v: string) => void
}

export function CardDetailsPanel({
  card, isEditing, workspaceId,
  title, setTitle, description, setDescription,
  type, setType, priority, setPriority,
  dueDate, setDueDate, assignee, setAssignee,
}: CardDetailsPanelProps) {
  const { getWorkspaceLabels, addLabel, toggleCardLabel } = useCardStore()
  const { getCardDocs } = useDocStore()

  const [showNewLabel, setShowNewLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0])

  const workspaceLabels = getWorkspaceLabels(workspaceId)
  const linkedDocs = card ? getCardDocs(card.id) : []

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

  const isLabelActive = (labelId: string) => card?.labels.some((cl) => cl.label_id === labelId) ?? false

  return (
    <div className="flex gap-4 overflow-y-auto flex-1 min-h-0 pt-1">
      {/* Left: Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titulo do card..."
          className="text-base font-medium h-11"
          autoFocus
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o problema ou tarefa..."
          className="flex-1 min-h-[180px] resize-none text-sm"
        />

        {/* Linked docs */}
        {linkedDocs.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> Documentos
            </span>
            {linkedDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 text-xs">
                <FileText className="h-3 w-3 text-muted-foreground" />
                <span className="truncate flex-1">{doc.title}</span>
                <Badge variant="outline" className="text-[9px]">{doc.source}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Metadata sidebar */}
      <div className="w-48 shrink-0 space-y-3 border-l pl-4">
        {/* Type */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tipo</span>
          <Select value={type} onValueChange={(v) => setType(v as CardType)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CARD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CARD_TYPE_CONFIG[t].bgColor} ${CARD_TYPE_CONFIG[t].color} border-0`}>
                    {CARD_TYPE_CONFIG[t].label}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Prioridade</span>
          <Select value={priority} onValueChange={(v) => setPriority(v as CardPriority)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CARD_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className={CARD_PRIORITY_CONFIG[p].color}>{CARD_PRIORITY_CONFIG[p].label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Due date */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Data limite</span>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-xs" />
        </div>

        {/* Assignee */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Responsavel</span>
          <Select value={assignee || 'unassigned'} onValueChange={(v) => setAssignee(v === 'unassigned' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">
                <span className="text-muted-foreground">Nao atribuido</span>
              </SelectItem>
              <SelectItem value="eu">
                <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> Eu</span>
              </SelectItem>
              <SelectItem value="ai-agent">
                <span className="flex items-center gap-1.5"><Bot className="h-3 w-3" /> AI Agent</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Spec status */}
        {card?.spec_status && (
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Spec</span>
            <Badge variant="outline" className="text-[10px]">{card.spec_status}</Badge>
          </div>
        )}

        {/* Labels */}
        {isEditing && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Labels</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowNewLabel(!showNewLabel)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {showNewLabel && (
              <div className="space-y-1.5">
                <Input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Nome..."
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateLabel()}
                />
                <div className="flex gap-1">
                  {LABEL_COLORS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-4 w-4 rounded-full shrink-0 ${newLabelColor === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'opacity-50 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewLabelColor(c)}
                    />
                  ))}
                </div>
                <Button size="sm" className="h-6 text-[10px] w-full" onClick={handleCreateLabel} disabled={!newLabelName.trim()}>Criar</Button>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {workspaceLabels.map((label) => {
                const active = isLabelActive(label.id)
                return (
                  <Badge
                    key={label.id}
                    variant={active ? 'default' : 'outline'}
                    className={`cursor-pointer text-[10px] ${active ? 'text-white border-0' : 'opacity-50 hover:opacity-100'}`}
                    style={active ? { backgroundColor: label.color } : undefined}
                    onClick={() => card && toggleCardLabel(card.id, label)}
                  >
                    {!active && <span className="h-1.5 w-1.5 rounded-full mr-0.5" style={{ backgroundColor: label.color }} />}
                    {label.name}
                    {active && <X className="h-2.5 w-2.5 ml-0.5" />}
                  </Badge>
                )
              })}
              {workspaceLabels.length === 0 && !showNewLabel && (
                <span className="text-[10px] text-muted-foreground">Nenhuma</span>
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        {isEditing && card && (
          <div className="pt-2 border-t space-y-0.5 text-[10px] text-muted-foreground">
            <p>Criado: {new Date(card.created_at).toLocaleDateString('pt-BR')}</p>
            <p>Atualizado: {new Date(card.updated_at).toLocaleDateString('pt-BR')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
