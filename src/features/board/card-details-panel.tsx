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
import { MessageResponse } from '@/components/ai-elements/message'
import { useState } from 'react'
import { Plus, X, FileText, BookOpen, User, Bot, Eye, Pencil } from 'lucide-react'
import { PrStatusBadge } from './pr-status-badge'
import { InfoHint } from '@/components/ui/info-hint'

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
  disabled?: boolean
}

export function CardDetailsPanel({
  card, isEditing, workspaceId,
  title, setTitle, description, setDescription,
  type, setType, priority, setPriority,
  dueDate, setDueDate, assignee, setAssignee,
  disabled = false,
}: CardDetailsPanelProps) {
  const { getWorkspaceLabels, addLabel, toggleCardLabel } = useCardStore()
  const { getCardDocs } = useDocStore()

  const [showNewLabel, setShowNewLabel] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0])
  const [descViewMode, setDescViewMode] = useState<'preview' | 'edit'>(
    isEditing && description.includes('##') ? 'preview' : 'edit',
  )

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
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Title */}
        <Textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titulo do card..."
          className="text-base font-medium resize-none min-h-[44px] border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
          rows={1}
          autoFocus
          disabled={disabled}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = 'auto'
            target.style.height = target.scrollHeight + 'px'
          }}
        />

        {/* Description toggle */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Descricao</span>
          {description.trim() && (
            <div className="flex rounded-md border overflow-hidden">
              <button
                className={`px-2 py-0.5 text-[10px] flex items-center gap-1 transition-colors ${descViewMode === 'preview' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setDescViewMode('preview')}
              >
                <Eye className="h-2.5 w-2.5" />
                Preview
              </button>
              <button
                className={`px-2 py-0.5 text-[10px] flex items-center gap-1 transition-colors ${descViewMode === 'edit' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setDescViewMode('edit')}
              >
                <Pencil className="h-2.5 w-2.5" />
                Editar
              </button>
            </div>
          )}
        </div>

        {/* Description content */}
        <div className="flex-1 min-h-0">
          {descViewMode === 'preview' && description.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none p-3 border rounded-md overflow-y-auto h-full bg-muted/5">
              <MessageResponse>{description}</MessageResponse>
            </div>
          ) : (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o problema ou tarefa..."
              className="h-full min-h-[160px] resize-none text-sm"
              disabled={disabled}
            />
          )}
        </div>

        {/* Linked docs */}
        {linkedDocs.length > 0 && (
          <div className="space-y-1.5 pt-1">
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

      {/* Right: cockpit sidebar — agrupado em IDENTIFICAÇÃO / ROTEAMENTO / TELEMETRIA */}
      <div className="w-52 shrink-0 space-y-4 border-l pl-4">

        {/* ─── IDENTIFICAÇÃO ─── */}
        <SectionBlock label="Identificacao">
          <FieldRow label="Tipo">
            <Select value={type} onValueChange={(v) => setType(v as CardType)} disabled={disabled}>
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
          </FieldRow>
          <FieldRow label="Prioridade">
            <Select value={priority} onValueChange={(v) => setPriority(v as CardPriority)} disabled={disabled}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CARD_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={CARD_PRIORITY_CONFIG[p].color}>{CARD_PRIORITY_CONFIG[p].label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </SectionBlock>

        {/* ─── ROTEAMENTO ─── */}
        <SectionBlock label="Roteamento">
          <FieldRow label="Responsavel">
            <Select value={assignee || 'unassigned'} onValueChange={(v) => setAssignee(v === 'unassigned' ? '' : v)} disabled={disabled}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned"><span className="text-muted-foreground">Nao atribuido</span></SelectItem>
                <SelectItem value="eu"><span className="flex items-center gap-1.5"><User className="h-3 w-3" /> Eu</span></SelectItem>
                <SelectItem value="ai-agent"><span className="flex items-center gap-1.5"><Bot className="h-3 w-3" /> AI Agent</span></SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Data limite">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-xs" disabled={disabled} />
          </FieldRow>

          {isEditing && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Labels</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowNewLabel(!showNewLabel)} disabled={disabled}>
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
                      onClick={() => !disabled && card && toggleCardLabel(card.id, label)}
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
        </SectionBlock>

        {/* ─── TELEMETRIA ─── (read-only, somente edicao) */}
        {isEditing && card && (
          <SectionBlock label="Telemetria">
            <TelemetryRow
              label="Spec"
              hint={{
                text: 'Estado da especificacao tecnica do card',
                detail: 'draft = rascunho · ready = aprovada · in_progress = sendo implementada · review = aguardando revisao · done = concluida',
              }}
            >
              {card.spec_status ? (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">{card.spec_status}</Badge>
              ) : <span className="text-muted-foreground/60">—</span>}
            </TelemetryRow>
            <TelemetryRow label="Docs">
              <span className="font-mono tabular-nums text-foreground">{linkedDocs.length}</span>
            </TelemetryRow>
            <TelemetryRow label="Criado">
              <span className="font-mono">{new Date(card.created_at).toLocaleDateString('pt-BR')}</span>
            </TelemetryRow>
            <TelemetryRow label="Atualizado">
              <span className="font-mono">{new Date(card.updated_at).toLocaleDateString('pt-BR')}</span>
            </TelemetryRow>
          </SectionBlock>
        )}

        {/* ─── PULL REQUEST ─── (live status via gh CLI) */}
        {isEditing && card?.pr_url && (
          <SectionBlock label="Pull Request">
            <PrStatusBadge url={card.pr_url} />
          </SectionBlock>
        )}
      </div>
    </div>
  )
}

// ─── helpers ───

function SectionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <span className="flex-1 h-px bg-border/60" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function TelemetryRow({ label, children, hint }: {
  label: string
  children: React.ReactNode
  hint?: { text: string; detail?: string }
}) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="font-mono uppercase tracking-[0.12em] text-muted-foreground inline-flex items-center gap-1">
        {label}
        {hint && <InfoHint text={hint.text} detail={hint.detail} />}
      </span>
      <span className="text-right">{children}</span>
    </div>
  )
}
