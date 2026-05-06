import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useCardStore } from '@/entities/card/store'
import { useProjectStore } from '@/entities/card/project-store'
import { useAgentStore } from '@/entities/agent/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useState, useEffect } from 'react'
import { ArrowLeft, Trash2, Plus, X, FolderOpen, Search, Loader2, CheckCircle2, AlertCircle, GitBranch, GitPullRequest, FileCode, Bot, Wand2, Settings, Tag, Columns3 } from 'lucide-react'
import { AUTOMATION_ACTION_LABELS } from '@/entities/card/types'
import { daemonClient } from '@/shared/lib/daemon-client'
import type { InstalledAgent, ScanResult } from '@/entities/card/project-types'
import { toast } from 'sonner'
import { AgentsSettingsPanel } from '@/features/workspace-mgmt/agents-settings-panel'
import { InfoHint } from '@/components/ui/info-hint'

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#f97316']
const LABEL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { workspaces, updateWorkspace, deleteWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const { getWorkspaceLabels, addLabel, deleteLabel, getWorkspaceColumns, toggleColumnAutomation } = useCardStore()
  const { getWorkspaceProjects, addProject, updateProject, deleteProject } = useProjectStore()
  const { getWorkspaceAgents } = useAgentStore()

  const workspace = workspaces.find((w) => w.id === workspaceId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0])
  const [saved, setSaved] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectPath, setNewProjectPath] = useState('')
  const [availableAgents, setAvailableAgents] = useState<InstalledAgent[]>([])
  const [daemonOnline, setDaemonOnline] = useState<boolean | null>(null)
  const [scanning, setScanning] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({})
  const [bootstrapping, setBootstrapping] = useState<string | null>(null)
  const [analyzingGit, setAnalyzingGit] = useState<string | null>(null)
  const [gitProfiles, setGitProfiles] = useState<Record<string, { baseBranch: string; ghAccount: string; repoOwner: string; repoName: string; hasPrTemplate: boolean }>>({})
  const [confirm, confirmDialog] = useConfirm()


  useEffect(() => {
    if (workspace) {
      setName(workspace.name)
      setDescription(workspace.description || '')
      setColor(workspace.color)
      setActiveWorkspace(workspace.id)
    }
  }, [workspace, setActiveWorkspace])

  useEffect(() => {
    daemonClient.health()
      .then(() => { setDaemonOnline(true); return daemonClient.getAvailableAgents() })
      .then(setAvailableAgents)
      .catch(() => setDaemonOnline(false))
  }, [])

  if (!workspace || !workspaceId) {
    return <div className="p-6 text-muted-foreground">Workspace nao encontrado</div>
  }

  const labels = getWorkspaceLabels(workspaceId)
  const columns = getWorkspaceColumns(workspaceId)
  const projects = getWorkspaceProjects(workspaceId)

  const handleSave = () => {
    updateWorkspace(workspaceId, {
      name: name.trim(),
      slug: name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      description: description.trim() || null,
      color,
    })
    setSaved(true)
    toast.success('Workspace salvo')
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Excluir workspace "${workspace?.name}"?`,
      description: (
        <>
          Esta acao remove o workspace, todos os cards, colunas, labels, agentes
          e projetos vinculados. Os arquivos em
          {' '}<span className="font-mono text-foreground">~/.cockpit/tasks/{workspace?.slug}/</span>
          {' '}permanecem no disco.
          <br /><br />
          Esta acao <strong>nao pode ser desfeita</strong>.
        </>
      ),
      requireText: workspace?.name,
      confirmLabel: 'Excluir workspace',
    })
    if (!ok) return
    deleteWorkspace(workspaceId)
    navigate('/')
  }

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    const ok = await confirm({
      title: `Remover projeto "${projectName}" do workspace?`,
      description: <>O projeto sera desvinculado deste workspace. Os arquivos no disco <strong>nao</strong> sao tocados.</>,
      confirmLabel: 'Remover projeto',
    })
    if (ok) deleteProject(projectId)
  }

  const handleDeleteLabel = async (labelId: string, labelName: string) => {
    const ok = await confirm({
      title: `Excluir label "${labelName}"?`,
      description: 'A label sera removida de todos os cards.',
      confirmLabel: 'Excluir label',
    })
    if (ok) deleteLabel(workspaceId, labelId)
  }

  const handleAddLabel = () => {
    if (!newLabelName.trim()) return
    addLabel(workspaceId, newLabelName.trim(), newLabelColor)
    toast.success(`Label "${newLabelName.trim()}" criada`)
    setNewLabelName('')
  }

  const handleAddProject = () => {
    if (!newProjectPath.trim()) return
    const projectName = newProjectName.trim() || newProjectPath.split('/').pop() || 'Projeto'
    addProject({
      workspace_id: workspaceId, name: projectName, path: newProjectPath.trim(),
      agent_preference: null, auto_scan: false, scan_interval_hours: 4, auto_pr: false,
    })
    toast.success(`Projeto "${projectName}" adicionado`)
    setNewProjectName('')
    setNewProjectPath('')
  }

  const handleScanProject = async (projectPath: string, projectId: string) => {
    setScanning(projectId)
    try {
      const result = await daemonClient.scanProject(projectPath)
      setScanResults((prev) => ({ ...prev, [projectId]: result }))
      updateProject(projectId, { last_scan_at: new Date().toISOString() })
      const parts: string[] = []
      if (result.stack.length > 0) parts.push(result.stack.join(', '))
      if (result.git) parts.push(`branch: ${result.git.branch}`)
      if (result.todos.length > 0) parts.push(`${result.todos.length} TODOs`)
      toast.success(`Scan concluido: ${result.name}`, { description: parts.join(' · ') || undefined })
    } catch (err) {
      toast.error('Erro no scan', { description: err instanceof Error ? err.message : 'Daemon offline' })
    } finally { setScanning(null) }
  }

  const handleBootstrapProject = async (projectPath: string, projectId: string) => {
    setBootstrapping(projectId)
    try {
      const result = await daemonClient.bootstrapProject(projectPath)
      if (result.filesCreated.length > 0) {
        toast.success(`Bootstrap concluido`, { description: `Criados: ${result.filesCreated.join(', ')}` })
      } else {
        toast.info('Arquivos ja existem', { description: result.filesSkipped.join(', ') })
      }
      handleScanProject(projectPath, projectId)
    } catch (err) {
      toast.error('Erro no bootstrap', { description: err instanceof Error ? err.message : 'Daemon offline' })
    } finally { setBootstrapping(null) }
  }

  const handleSyncConfig = async (projectPath: string, projectId: string) => {
    if (!workspaceId) return
    try {
      const agents = getWorkspaceAgents(workspaceId).map((a) => ({
        name: a.name,
        role: a.role,
        provider: a.provider,
        model: a.model,
        temperature: a.temperature,
        max_tokens: a.max_tokens,
        system_prompt: a.system_prompt,
        enabled: a.enabled,
      }))
      const result = await daemonClient.syncProjectConfig(projectPath, agents, workspace?.name)
      updateProject(projectId, { config_synced_at: result.syncedAt })
      toast.success(`Config exportada: ${result.agentsExported} agentes`, {
        description: result.configPath.replace(/^\/Users\/[^/]+\//, '~/'),
      })
    } catch (err) {
      toast.error('Erro ao sincronizar config', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    }
  }

  const handleAnalyzeGitFlow = async (projectPath: string, projectId: string) => {
    setAnalyzingGit(projectId)
    try {
      const profile = await daemonClient.analyzeGitFlow(projectPath) as { baseBranch: string; ghAccount: string; repoOwner: string; repoName: string; hasPrTemplate: boolean }
      setGitProfiles((prev) => ({ ...prev, [projectId]: profile }))
      toast.success('Git flow analisado', {
        description: `Base: ${profile.baseBranch} · Conta: ${profile.ghAccount} · Template: ${profile.hasPrTemplate ? 'sim' : 'nao'}`,
      })
    } catch (err) {
      toast.error('Analise falhou', { description: err instanceof Error ? err.message : 'Erro' })
    } finally { setAnalyzingGit(null) }
  }

  const abbreviatePath = (p: string) => p.replace(/^\/Users\/[^/]+\//, '~/')
  const wsShortId = workspaceId.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {confirmDialog}
      {/* ── FLIGHT STRIP HEADER ── */}
      <div className="border rounded-lg overflow-hidden mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20">
          <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={() => navigate(`/workspace/${workspaceId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-muted-foreground">WORKSPACE</span>
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-background"
              style={{ backgroundColor: workspace.color, boxShadow: `0 0 8px ${workspace.color}40` }}
            />
            <span className="font-semibold text-foreground tracking-normal text-sm normal-case">{workspace.name}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-foreground tabular-nums">#{wsShortId}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Daemon LED */}
            <div className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
              daemonOnline ? 'text-emerald-500' : daemonOnline === false ? 'text-rose-500' : 'text-amber-500'
            }`}>
              <span className="relative flex h-2 w-2">
                {daemonOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  daemonOnline ? 'bg-emerald-500' : daemonOnline === false ? 'bg-rose-500' : 'bg-amber-500'
                }`} />
              </span>
              <span>DAEMON {daemonOnline ? 'ONLINE' : daemonOnline === false ? 'OFFLINE' : 'CHECK'}</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground bg-background flex-wrap">
          <span><span className="text-foreground tabular-nums">{String(projects.length).padStart(2, '0')}</span> proj</span>
          <span className="text-muted-foreground/30">·</span>
          <span><span className="text-foreground tabular-nums">{String(labels.length).padStart(2, '0')}</span> labels</span>
          <span className="text-muted-foreground/30">·</span>
          <span><span className="text-foreground tabular-nums">{String(columns.length).padStart(2, '0')}</span> colunas</span>
          {workspace.description && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="normal-case tracking-normal text-muted-foreground/70 truncate">{workspace.description}</span>
            </>
          )}
        </div>
      </div>

      {/* ── EXECUTORS TELEMETRY STRIP ── */}
      {daemonOnline && availableAgents.length > 0 && (
        <div className="mb-4 border rounded-md px-3 py-2 bg-muted/10">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-muted-foreground">━ EXECUTORS DETECTADOS</span>
            <span className="ml-auto flex items-center gap-3 flex-wrap">
              {availableAgents.map((a) => (
                <span key={a.name} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-foreground">{a.name}</span>
                  {a.version && <span className="text-muted-foreground/60 normal-case tracking-normal">{a.version.split(' ')[0]}</span>}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="font-mono text-[10px] uppercase tracking-[0.14em]">
          <TabsTrigger value="geral">
            <span className="mr-1.5 text-muted-foreground tabular-nums">[1]</span>
            <Settings className="h-3 w-3 mr-1" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="projetos">
            <span className="mr-1.5 text-muted-foreground tabular-nums">[2]</span>
            <FolderOpen className="h-3 w-3 mr-1" />
            Projetos
            {projects.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0 tabular-nums">{projects.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="agentes">
            <span className="mr-1.5 text-muted-foreground tabular-nums">[3]</span>
            <Bot className="h-3 w-3 mr-1" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="board">
            <span className="mr-1.5 text-muted-foreground tabular-nums">[4]</span>
            <Columns3 className="h-3 w-3 mr-1" />
            Board
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Geral ── */}
        <TabsContent value="geral" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>━ Identificacao</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ws-name" className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Nome</Label>
                <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-desc" className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Descricao</Label>
                <Textarea
                  id="ws-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Ex: CRM React + Supabase, PJ Fixo 6-8h/dia"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Cor</Label>
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-6 w-6 rounded-full transition-all ${color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'opacity-70 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="pt-1">
                <Button onClick={handleSave} disabled={!name.trim()} size="sm">
                  {saved ? <><CheckCircle2 className="h-4 w-4 mr-1" /> Salvo</> : 'Salvar alteracoes'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Labels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Labels
              </CardTitle>
              <CardDescription>Tags para organizar cards neste workspace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Nome da label..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                />
                <div className="flex gap-1">
                  {LABEL_COLORS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-5 w-5 rounded-full shrink-0 transition-all ${newLabelColor === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewLabelColor(c)}
                    />
                  ))}
                </div>
                <Button size="sm" onClick={handleAddLabel} disabled={!newLabelName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {labels.length > 0 ? (
                <div className="space-y-1">
                  {labels.map((label) => (
                    <div key={label.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 group">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
                        <span className="text-sm">{label.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteLabel(label.id, label.name)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">Nenhuma label criada ainda</p>
              )}
            </CardContent>
          </Card>

          {/* ── ZONA PERIGOSA ── */}
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-destructive">
                <AlertCircle className="h-3 w-3" />
                <span>━ Zona perigosa</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Excluir o workspace remove todos os cards, labels, agentes e projetos vinculados.
                  Os arquivos em <span className="font-mono">~/.cockpit/tasks/{workspace.slug}/</span> permanecem no disco.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Excluir workspace
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Projetos ── */}
        <TabsContent value="projetos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Adicionar projeto</CardTitle>
              <CardDescription>Vincule projetos para usar no Discovery e auto-scan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Nome (opcional)"
                  className="w-32"
                />
                <Input
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  placeholder="~/projetos/meu-projeto"
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
                />
                <Button onClick={handleAddProject} disabled={!newProjectPath.trim()}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          {projects.length > 0 ? (
            <div className="space-y-3">
              {projects.map((proj, projIdx) => {
                const scan = scanResults[proj.id]
                const projNum = String(projIdx + 1).padStart(2, '0')
                const projTotal = String(projects.length).padStart(2, '0')
                const scanDate = proj.last_scan_at
                  ? new Date(proj.last_scan_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  : null

                return (
                  <div key={proj.id} className="relative rounded-md border bg-card overflow-hidden">
                    {/* Accent bar */}
                    <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r-sm bg-primary/60" aria-hidden />

                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          <span className="tabular-nums">{projNum}/{projTotal}</span>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-foreground">{proj.name}</span>
                          {proj.last_scan_at && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="flex items-center gap-1 text-emerald-500">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                scanned
                              </span>
                            </>
                          )}
                        </div>
                        <p className="font-mono text-[12px] text-foreground/90 mt-0.5 truncate">
                          {abbreviatePath(proj.path)}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {daemonOnline && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleBootstrapProject(proj.path, proj.id)}
                              disabled={bootstrapping === proj.id}
                              title="Setup: gerar AGENTS.md, CLAUDE.md e commands"
                            >
                              {bootstrapping === proj.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleScanProject(proj.path, proj.id)}
                              disabled={scanning === proj.id}
                              title="Scan: detectar stack, branch, TODOs"
                            >
                              {scanning === proj.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteProject(proj.id, proj.name)}
                          title="Remover projeto do workspace"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Telemetry */}
                    <div className="px-4 py-2.5 space-y-1.5 font-mono text-[11px]">
                      {scan && (
                        <>
                          {scan.stack.length > 0 && (
                            <TelemetryLine label="Stack">
                              <div className="flex items-center gap-1 flex-wrap">
                                {scan.stack.map((s) => (
                                  <Badge key={s} variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                                    <FileCode className="h-2.5 w-2.5 mr-0.5" />{s}
                                  </Badge>
                                ))}
                              </div>
                            </TelemetryLine>
                          )}
                          {scan.git && (
                            <TelemetryLine label="Branch">
                              <span className="flex items-center gap-1.5">
                                <GitBranch className="h-3 w-3 text-muted-foreground" />
                                <span className="text-foreground">{scan.git.branch}</span>
                                {scan.todos.length > 0 && (
                                  <span className="text-amber-500/80 ml-2 normal-case tracking-normal">
                                    {scan.todos.length} TODO{scan.todos.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </span>
                            </TelemetryLine>
                          )}
                          {(scan.agentConfigs.hasAgentsMd || scan.agentConfigs.hasClaudeDir) && (
                            <TelemetryLine label="Agents">
                              <div className="flex items-center gap-1">
                                {scan.agentConfigs.hasAgentsMd && (
                                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-green-600">AGENTS.md</Badge>
                                )}
                                {scan.agentConfigs.hasClaudeDir && (
                                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-purple-600">.claude/</Badge>
                                )}
                              </div>
                            </TelemetryLine>
                          )}
                        </>
                      )}
                      {scanDate && (
                        <TelemetryLine label="Scan">
                          <span className="text-muted-foreground tabular-nums">{scanDate}</span>
                        </TelemetryLine>
                      )}
                      {/* Persistence paths — onde o cockpit guarda dados deste projeto */}
                      <TelemetryLine label="Task WS">
                        <span className="text-muted-foreground/80 truncate" title="Spec/discovery/interview/feedback ficam aqui (no seu home)">
                          ~/.cockpit/tasks/{workspace.slug}/&lt;card-id&gt;/
                        </span>
                      </TelemetryLine>
                      <TelemetryLine label="Project WS">
                        <span className="text-muted-foreground/60 truncate" title="Cópia para o agent CLI ler — só criada após disparar Implementar">
                          {abbreviatePath(proj.path)}/.cockpit/task/ <span className="text-muted-foreground/40">(após implementar)</span>
                        </span>
                      </TelemetryLine>
                    </div>

                    {/* Integration block */}
                    <div className="border-t border-border/60 px-4 py-2.5 bg-muted/10 space-y-2">
                      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <span>━ Integracao</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs">
                          <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                          Auto PR apos implementacao
                          <InfoHint
                            text="Cria PR automaticamente no GitHub quando o agent termina."
                            detail='Precisa de "gh" CLI autenticado. PR vira em modo draft. Desligue se voce prefere revisar local antes de publicar.'
                          />
                        </span>
                        <Switch
                          checked={proj.auto_pr ?? false}
                          onCheckedChange={(checked) => updateProject(proj.id, { auto_pr: checked })}
                        />
                      </div>

                      {/* N7 — Sync config-in-project */}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs">
                          <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                          Sincronizar agentes via git
                          <span className="font-mono text-[9px] text-muted-foreground/60 normal-case tracking-normal">
                            (.cockpit/config.json)
                          </span>
                        </span>
                        <Switch
                          checked={proj.sync_config_to_project ?? false}
                          onCheckedChange={(checked) => {
                            updateProject(proj.id, { sync_config_to_project: checked })
                            if (checked) handleSyncConfig(proj.path, proj.id)
                          }}
                        />
                      </div>
                      {proj.sync_config_to_project && (
                        <div className="flex items-center gap-2 pl-5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px]"
                            onClick={() => handleSyncConfig(proj.path, proj.id)}
                          >
                            Sincronizar agora
                          </Button>
                          {proj.config_synced_at && (
                            <span className="text-muted-foreground/60 normal-case tracking-normal">
                              ultimo sync: {new Date(proj.config_synced_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                      {daemonOnline && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px]"
                            onClick={() => handleAnalyzeGitFlow(proj.path, proj.id)}
                            disabled={analyzingGit === proj.id}
                          >
                            {analyzingGit === proj.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><GitBranch className="h-3 w-3 mr-1" />Analisar Git Flow</>}
                          </Button>
                          {gitProfiles[proj.id] && (
                            <div className="flex items-center gap-1 font-mono text-[10px]">
                              <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">base: {gitProfiles[proj.id].baseBranch}</Badge>
                              <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">gh: {gitProfiles[proj.id].ghAccount}</Badge>
                              {gitProfiles[proj.id].hasPrTemplate && (
                                <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 text-green-600">PR template</Badge>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 pb-6 text-center">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Nenhum projeto registrado</p>
                <p className="text-xs text-muted-foreground mt-1">Adicione um projeto acima para usar o Discovery</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB: Agentes ── */}
        <TabsContent value="agentes" className="space-y-4">
          <AgentsSettingsPanel workspaceId={workspaceId} />
        </TabsContent>

        {/* ── TAB: Board ── */}
        <TabsContent value="board" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Colunas e Automacoes</CardTitle>
              <CardDescription>Configure automacoes que disparam quando um card entra em cada coluna</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {columns.map((col, i) => (
                  <div key={col.id} className="rounded-lg border overflow-hidden">
                    {/* Column header */}
                    <div className="flex items-center gap-3 py-2 px-3 bg-muted/20">
                      <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color ?? '#6b7280' }} />
                      <span className="text-sm font-medium flex-1">{col.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">{col.slug}</Badge>
                    </div>

                    {/* Automations */}
                    {col.automations && col.automations.length > 0 && (
                      <div className="px-3 py-2 space-y-1.5">
                        {col.automations.map((auto) => (
                          <div key={auto.id} className="flex items-center justify-between py-1">
                            <span className={`text-xs ${auto.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {AUTOMATION_ACTION_LABELS[auto.action] || auto.action}
                            </span>
                            <Switch
                              checked={auto.enabled}
                              onCheckedChange={() => toggleColumnAutomation(workspaceId, col.id, auto.id)}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {(!col.automations || col.automations.length === 0) && (
                      <div className="px-3 py-2">
                        <span className="text-[11px] text-muted-foreground">Sem automacoes</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TelemetryLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
