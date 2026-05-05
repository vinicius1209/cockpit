import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { Card, CardType, CardPriority } from '@/entities/card/types'
import { useCardStore, type ProcessingState } from '@/entities/card/store'
import { useAgentStore } from '@/entities/agent/store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useProjectStore } from '@/entities/card/project-store'
import { useState, useEffect } from 'react'
import { Trash2, Bot } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { AgentChat } from '@/features/agent-runner/agent-chat'
import { SpecPanel } from '@/features/spec-engine/spec-panel'
import { InterviewPanel } from '@/features/agent-runner/interview-panel'
import { ImplementPanel } from '@/features/implement/implement-panel'
import { CardDetailsPanel } from './card-details-panel'
import { CardFlightStrip } from './card-flight-strip'
import { CardPipelineTabs, type PipelineTab } from './card-pipeline-tabs'
import { CardStatusBar } from './card-status-bar'
import { ErrorBoundary } from '@/components/ui/error-boundary'

interface CardDialogProps {
  card: Card | null
  open: boolean
  onClose: () => void
  defaultColumnId?: string
  workspaceId: string
}

export function CardDialog({ card, open, onClose, defaultColumnId, workspaceId }: CardDialogProps) {
  const { addCard, updateCard, deleteCard } = useCardStore.getState()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<CardType>('feature')
  const [priority, setPriority] = useState<CardPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [activeTab, setActiveTab] = useState<PipelineTab>('details')
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false)

  const isEditing = !!card
  const processing = useCardStore((s) => card ? s.processingCards[card.id] : undefined) as ProcessingState | undefined
  const [confirm, confirmDialog] = useConfirm()

  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace())
  const { getWorkspaceProjects } = useProjectStore()
  const { getWorkspaceAgents } = useAgentStore()
  const projects = getWorkspaceProjects(workspaceId)
  const projectName = card?.project_id
    ? projects.find((p) => p.id === card.project_id)?.name || null
    : projects[0]?.name || null

  // Telemetry — qual agente/model esta sendo usado nesta tab
  const agents = getWorkspaceAgents(workspaceId)
  const tabAgent =
    activeTab === 'interview' ? agents.find((a) => a.role === 'interviewer') :
    activeTab === 'spec' ? agents.find((a) => a.role === 'spec-writer') :
    activeTab === 'implement' ? agents.find((a) => a.role === 'implementer') :
    null

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
      setAgentDrawerOpen(false)
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
        task_workspace_path: null,
      })
    }
    onClose()
  }

  const handleDelete = async () => {
    if (!card) return
    const ok = await confirm({
      title: `Excluir card "${card.title}"?`,
      description: (
        <>
          O card sera removido permanentemente, incluindo entrevista, spec e
          historico de implementacao. Os arquivos em
          {' '}<span className="font-mono text-foreground">~/.cockpit/tasks/&lt;ws&gt;/{card.id}/</span>
          {' '}permanecem no disco.
        </>
      ),
      confirmLabel: 'Excluir card',
    })
    if (!ok) return
    deleteCard(card.id)
    onClose()
  }

  return (
    <>
      {confirmDialog}
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className={`sm:max-w-4xl ${isEditing ? 'h-[88vh]' : 'h-auto'} flex flex-col p-0 gap-0 overflow-hidden`}>
          {/* ──── FLIGHT STRIP HEADER ──── */}
          <DialogHeader className="border-b px-4 py-3 space-y-1.5 shrink-0">
            <CardFlightStrip card={card} isEditing={isEditing} />
            <DialogTitle className="text-base font-semibold leading-snug pr-8 line-clamp-2">
              {isEditing ? (title || card?.title || 'Editar Card') : 'Novo Card'}
            </DialogTitle>
          </DialogHeader>

          {/* ──── PIPELINE TABS (only when editing) ──── */}
          {isEditing && card && (
            <CardPipelineTabs
              card={card}
              active={activeTab}
              onChange={setActiveTab}
              onOpenAgent={() => setAgentDrawerOpen(true)}
              agentActive={agentDrawerOpen}
              processing={processing}
            />
          )}

          {/* ──── ACTIVE PANEL ──── */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 py-3">
            {activeTab === 'details' && (
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
            )}

            {isEditing && card && activeTab === 'interview' && (
              <ErrorBoundary fallbackLabel="Entrevista">
                <InterviewPanel card={card} workspaceId={workspaceId} />
              </ErrorBoundary>
            )}
            {isEditing && card && activeTab === 'spec' && (
              <ErrorBoundary fallbackLabel="Spec">
                <SpecPanel card={card} workspaceId={workspaceId} />
              </ErrorBoundary>
            )}
            {isEditing && card && activeTab === 'implement' && (
              <ErrorBoundary fallbackLabel="Implementacao">
                <ImplementPanel card={card} workspaceId={workspaceId} />
              </ErrorBoundary>
            )}
          </div>

          {/* ──── STATUS BAR (telemetria persistente) ──── */}
          {isEditing && (
            <CardStatusBar
              processing={processing}
              workspaceName={activeWorkspace?.name}
              projectName={projectName}
              agentName={tabAgent?.name || null}
              modelName={tabAgent?.model || null}
            />
          )}

          {/* ──── FOOTER ──── */}
          <div className="flex items-center justify-between border-t px-4 py-3 shrink-0">
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

      {/* ──── AI AGENT DRAWER (off-pipeline) ──── */}
      {isEditing && card && (
        <Sheet open={agentDrawerOpen} onOpenChange={setAgentDrawerOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl flex flex-col p-0 gap-0"
          >
            <SheetHeader className="border-b px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <Bot className="h-3 w-3" />
                <span>AI CHAT · OFF-PIPELINE</span>
              </div>
              <SheetTitle className="text-sm">
                Conversa livre sobre <span className="text-muted-foreground font-normal">{card.title}</span>
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ErrorBoundary fallbackLabel="AI Agent">
                <AgentChat card={card} workspaceId={workspaceId} />
              </ErrorBoundary>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
