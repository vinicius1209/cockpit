// First-run wizard — 3 passos guiados pra usuario que abre Cockpit pela
// primeira vez (ou pra quem nunca criou um card real).
//
// Filosofia: nao bloquear (modal pode ser fechado), apenas reduzir friccao
// pra "qual o primeiro passo?". Foco em pessoa nao 100% tecnica que
// instalou via README sem entender o modelo workspace/projeto/card.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useCardStore } from '@/entities/card/store'
import { useProjectStore } from '@/entities/card/project-store'
import { CheckCircle2, Folders, FolderGit2, FileText, ArrowRight, Sparkles } from 'lucide-react'

type Step = 'welcome' | 'workspace' | 'project' | 'card' | 'done'

interface FirstRunWizardProps {
  open: boolean
  onClose: () => void
}

export function FirstRunWizard({ open, onClose }: FirstRunWizardProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [wsName, setWsName] = useState('')
  const [wsDesc, setWsDesc] = useState('')
  const [projName, setProjName] = useState('')
  const [projPath, setProjPath] = useState('')
  const [cardTitle, setCardTitle] = useState('')
  const [cardDesc, setCardDesc] = useState('')
  const [created, setCreated] = useState<{ wsId?: string; cardId?: string }>({})

  const navigate = useNavigate()
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const { addWorkspace, setActiveWorkspace } = useWorkspaceStore.getState()
  const { addCard, getWorkspaceColumns } = useCardStore.getState()
  const { addProject } = useProjectStore.getState()

  // Reset quando abre
  useEffect(() => {
    if (open) setStep('welcome')
  }, [open])

  // Pula direto pra projeto se ja tem workspaces
  useEffect(() => {
    if (open && step === 'workspace' && workspaces.length > 0) {
      // Pre-selecionar primeiro workspace existente
      setActiveWorkspace(workspaces[0].id)
      setStep('project')
    }
  }, [open, step, workspaces, setActiveWorkspace])

  const slug = useMemo(() => {
    return wsName
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'meu-workspace'
  }, [wsName])

  const handleCreateWorkspace = () => {
    const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
    addWorkspace({
      id,
      name: wsName.trim() || 'Meu Workspace',
      slug,
      description: wsDesc.trim() || null,
      color: '#3b82f6',
      icon: null,
    } as never)
    setActiveWorkspace(id)
    setCreated((c) => ({ ...c, wsId: id }))
    setStep('project')
  }

  const handleCreateProject = () => {
    const wsId = created.wsId || workspaces[0]?.id
    if (!wsId || !projPath.trim()) {
      // Pula projeto se vazio
      setStep('card')
      return
    }
    addProject({
      workspace_id: wsId,
      name: projName.trim() || projPath.split('/').filter(Boolean).pop() || 'Projeto',
      path: projPath.trim(),
      auto_pr: false,
      last_scan_at: null,
    } as never)
    setStep('card')
  }

  const handleCreateCard = () => {
    const wsId = created.wsId || workspaces[0]?.id
    if (!wsId || !cardTitle.trim()) {
      setStep('done')
      return
    }
    const cols = getWorkspaceColumns(wsId)
    if (cols.length === 0) {
      setStep('done')
      return
    }
    const cardId = addCard({
      workspace_id: wsId,
      column_id: cols[0].id,
      project_id: null,
      title: cardTitle.trim(),
      description: cardDesc.trim() || null,
      type: 'feature',
      priority: 'medium',
      position: 0,
      assignee: null,
      due_date: null,
      spec_status: null,
      spec_content: null,
      interview_notes: null,
      interview_messages: null,
      task_workspace_path: null,
    } as never)
    setCreated((c) => ({ ...c, cardId }))
    setStep('done')
  }

  const handleFinish = () => {
    onClose()
    if (created.wsId) {
      const target = created.cardId
        ? `/workspace/${created.wsId}?cardId=${encodeURIComponent(created.cardId)}`
        : `/workspace/${created.wsId}`
      navigate(target)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-amber-500" />
            BOARDING · STEP {stepNumber(step)} / 4
          </div>
          <DialogTitle className="text-xl">{stepTitle(step)}</DialogTitle>
          <DialogDescription>{stepSubtitle(step)}</DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 min-h-[280px] flex flex-col">
          {step === 'welcome' && <WelcomePane />}

          {step === 'workspace' && (
            <div className="space-y-4">
              <FieldBlock icon={Folders} label="Nome do workspace" hint='Ex: "Trabalho", "Projetos pessoais", "Cliente XPTO"'>
                <Input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Meu Workspace" autoFocus />
              </FieldBlock>
              <FieldBlock label="Descricao (opcional)">
                <Textarea value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} placeholder="O que voce vai gerenciar aqui?" rows={2} />
              </FieldBlock>
              <div className="text-xs text-muted-foreground font-mono">
                slug: <span className="text-foreground">#{slug}</span> <span className="opacity-50">(usado em URLs e no CLI)</span>
              </div>
            </div>
          )}

          {step === 'project' && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/30 border p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Por que vincular um projeto?</strong> Quando voce mandar implementar um card,
                o agent vai trabalhar nesse diretorio (criar branch, editar codigo, abrir PR). Pode pular agora se ainda nao tem
                projeto e adicionar depois em <em>Workspace settings &gt; Projetos</em>.
              </div>
              <FieldBlock icon={FolderGit2} label="Path absoluto do projeto" hint='Ex: /Users/voce/projetos/meu-app'>
                <Input value={projPath} onChange={(e) => setProjPath(e.target.value)} placeholder="/Users/..." autoFocus />
              </FieldBlock>
              <FieldBlock label="Nome (opcional)">
                <Input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="default: nome do diretorio" />
              </FieldBlock>
            </div>
          )}

          {step === 'card' && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/30 border p-3 text-xs text-muted-foreground">
                Cards sao tarefas. Cada card pode virar uma <em>spec</em> e depois uma <em>implementacao</em> automatizada.
                Comece com algo simples — voce pode editar tudo depois.
              </div>
              <FieldBlock icon={FileText} label="Titulo do primeiro card">
                <Input value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} placeholder='Ex: "Refatorar tela de login"' autoFocus />
              </FieldBlock>
              <FieldBlock label="Descricao (opcional)">
                <Textarea value={cardDesc} onChange={(e) => setCardDesc(e.target.value)} placeholder="Detalhes que ajudam o agent a entender o problema." rows={3} />
              </FieldBlock>
            </div>
          )}

          {step === 'done' && <DonePane wsCreated={!!created.wsId} cardCreated={!!created.cardId} />}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between bg-muted/10">
          {step !== 'welcome' && step !== 'done' ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(prevStep(step))}>
              Voltar
            </Button>
          ) : <div />}

          <div className="flex items-center gap-2">
            {step !== 'done' && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                pular tutorial
              </Button>
            )}
            {step === 'welcome' && (
              <Button size="sm" onClick={() => setStep(workspaces.length > 0 ? 'project' : 'workspace')}>
                Comecar <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 'workspace' && (
              <Button size="sm" onClick={handleCreateWorkspace} disabled={!wsName.trim()}>
                Criar workspace <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 'project' && (
              <Button size="sm" onClick={handleCreateProject}>
                {projPath.trim() ? 'Vincular projeto' : 'Pular'} <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 'card' && (
              <Button size="sm" onClick={handleCreateCard}>
                {cardTitle.trim() ? 'Criar card' : 'Pular'} <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 'done' && (
              <Button size="sm" onClick={handleFinish}>
                Ir pro board <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FieldBlock({ icon: Icon, label, hint, children }: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground/70 pl-1">{hint}</div>}
    </div>
  )
}

function WelcomePane() {
  return (
    <div className="flex flex-col items-center text-center space-y-4 pt-4">
      <div className="text-4xl">🛫</div>
      <div className="space-y-2 max-w-md">
        <p className="text-sm text-muted-foreground">
          Cockpit organiza seus projetos e dispara <strong className="text-foreground">agents AI</strong> pra implementar tarefas.
        </p>
        <p className="text-sm text-muted-foreground">
          Em <strong className="text-foreground">3 passos rapidos</strong> voce vai ter:
          {' '}<span className="font-mono text-[11px]">workspace → projeto → primeiro card</span>.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 w-full max-w-sm pt-2">
        <Tile icon={Folders} label="Workspace" sub="organiza" />
        <Tile icon={FolderGit2} label="Projeto" sub="onde rodar" />
        <Tile icon={FileText} label="Card" sub="o que fazer" />
      </div>
    </div>
  )
}

function DonePane({ wsCreated, cardCreated }: { wsCreated: boolean; cardCreated: boolean }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4 pt-6">
      <CheckCircle2 className="h-12 w-12 text-emerald-500" />
      <div className="space-y-2">
        <p className="text-base font-semibold">Tudo pronto!</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          {wsCreated && <li>✓ Workspace criado</li>}
          {cardCreated && <li>✓ Primeiro card criado</li>}
        </ul>
        <p className="text-xs text-muted-foreground pt-2 max-w-sm">
          No board, abra o card → tab <strong>Spec</strong> → "Gerar com AI" pra ver o agent escrevendo a especificacao.
          Depois clique <strong>Implementar</strong> e veja a magia.
        </p>
      </div>
    </div>
  )
}

function Tile({ icon: Icon, label, sub }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  sub: string
}) {
  return (
    <div className="rounded-md border bg-card p-3 text-center space-y-1">
      <Icon className="h-5 w-5 mx-auto text-muted-foreground" />
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  )
}

function stepNumber(s: Step): string {
  return { welcome: '1', workspace: '2', project: '3', card: '4', done: '4' }[s]
}
function stepTitle(s: Step): string {
  return {
    welcome: 'Bem-vindo ao Cockpit',
    workspace: 'Crie seu primeiro workspace',
    project: 'Vincule um projeto local',
    card: 'Crie seu primeiro card',
    done: 'Boarding completo',
  }[s]
}
function stepSubtitle(s: Step): string {
  return {
    welcome: 'Tour rapido — em ~1 minuto voce ta usando',
    workspace: 'Workspace agrupa cards + projetos relacionados',
    project: 'Onde os agents vao trabalhar (cria branches, edita codigo)',
    card: 'Tarefa concreta — bug, feature, refactor, qualquer coisa',
    done: 'Pronto pra explorar',
  }[s]
}
function prevStep(s: Step): Step {
  return ({ workspace: 'welcome', project: 'workspace', card: 'project', done: 'card', welcome: 'welcome' } as const)[s]
}
