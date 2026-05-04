import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useCardStore } from '@/entities/card/store'
import { useProjectStore } from '@/entities/card/project-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { useState, useEffect } from 'react'
import { ArrowLeft, Trash2, Plus, X, FolderOpen, Search, Loader2, CheckCircle2, AlertCircle, GitBranch, GitPullRequest, FileCode, Bot, Wand2, Settings, Tag, Columns3 } from 'lucide-react'
import { AUTOMATION_ACTION_LABELS } from '@/entities/card/types'
import { daemonClient } from '@/shared/lib/daemon-client'
import type { InstalledAgent, ScanResult } from '@/entities/card/project-types'
import { toast } from 'sonner'

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#f97316']
const LABEL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { workspaces, updateWorkspace, deleteWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const { getWorkspaceLabels, addLabel, deleteLabel, getWorkspaceColumns, toggleColumnAutomation } = useCardStore()
  const { getWorkspaceProjects, addProject, updateProject, deleteProject } = useProjectStore()

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

  const handleDelete = () => {
    deleteWorkspace(workspaceId)
    navigate('/')
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

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/workspace/${workspaceId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: workspace.color }} />
          <h1 className="text-lg font-semibold">{workspace.name}</h1>
          <span className="text-muted-foreground text-sm">/ Configuracoes</span>
        </div>
        {/* Daemon status */}
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${
          daemonOnline ? 'bg-green-500/10 text-green-500' : daemonOnline === false ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'
        }`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {daemonOnline ? 'Online' : daemonOnline === false ? 'Offline' : '...'}
        </div>
      </div>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList>
          <TabsTrigger value="geral">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="projetos">
            <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
            Projetos
            {projects.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{projects.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="board">
            <Columns3 className="h-3.5 w-3.5 mr-1.5" />
            Board
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Geral ── */}
        <TabsContent value="geral" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informacoes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Nome</Label>
                  <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <div className="flex gap-1.5 pt-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`h-7 w-7 rounded-full transition-all ${color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'opacity-70 hover:opacity-100'}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setColor(c)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-desc">Descricao</Label>
                <Textarea
                  id="ws-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Ex: CRM React + Supabase, PJ Fixo 6-8h/dia"
                />
              </div>
              <div className="flex items-center justify-between">
                <Button onClick={handleSave} disabled={!name.trim()}>
                  {saved ? <><CheckCircle2 className="h-4 w-4 mr-1" /> Salvo</> : 'Salvar alteracoes'}
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Excluir workspace
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
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" onClick={() => deleteLabel(workspaceId, label.id)}>
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
        </TabsContent>

        {/* ── TAB: Projetos ── */}
        <TabsContent value="projetos" className="space-y-4">
          {/* Agents detectados */}
          {daemonOnline && availableAgents.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">Agents detectados:</span>
              {availableAgents.map((a) => (
                <Badge key={a.name} variant="outline" className="text-[10px]">
                  <Bot className="h-2.5 w-2.5 mr-0.5" />
                  {a.name} {a.version?.split(' ')[0]}
                </Badge>
              ))}
            </div>
          )}

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
              {projects.map((proj) => {
                const scan = scanResults[proj.id]
                return (
                  <Card key={proj.id}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start gap-3">
                        <FolderOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{proj.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{abbreviatePath(proj.path)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {proj.last_scan_at && (
                            <Badge variant="outline" className="text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 text-green-500" />
                              scanned
                            </Badge>
                          )}
                          {daemonOnline && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleBootstrapProject(proj.path, proj.id)} disabled={bootstrapping === proj.id} title="Gerar AGENTS.md, CLAUDE.md e commands">
                                {bootstrapping === proj.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Wand2 className="h-3.5 w-3.5 mr-1" />Setup</>}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleScanProject(proj.path, proj.id)} disabled={scanning === proj.id}>
                                {scanning === proj.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Search className="h-3.5 w-3.5 mr-1" />Scan</>}
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteProject(proj.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {scan && (
                        <>
                          <Separator className="my-2.5" />
                          <div className="space-y-1.5 pl-7">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {scan.stack.map((s) => (
                                <Badge key={s} variant="secondary" className="text-[10px]"><FileCode className="h-2.5 w-2.5 mr-0.5" />{s}</Badge>
                              ))}
                              {scan.git && (
                                <Badge variant="outline" className="text-[10px]"><GitBranch className="h-2.5 w-2.5 mr-0.5" />{scan.git.branch}</Badge>
                              )}
                              {scan.agentConfigs.hasAgentsMd && <Badge variant="outline" className="text-[10px] text-green-600">AGENTS.md</Badge>}
                              {scan.agentConfigs.hasClaudeDir && <Badge variant="outline" className="text-[10px] text-purple-600">.claude/</Badge>}
                            </div>
                            {scan.todos.length > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                <AlertCircle className="h-3 w-3 inline mr-1" />
                                {scan.todos.length} TODO{scan.todos.length > 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      {/* Git Flow & Auto-PR */}
                      <Separator className="my-2.5" />
                      <div className="pl-7 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs">Auto PR apos implementacao</span>
                          </div>
                          <Switch
                            checked={proj.auto_pr ?? false}
                            onCheckedChange={(checked) => updateProject(proj.id, { auto_pr: checked })}
                          />
                        </div>
                        {daemonOnline && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleAnalyzeGitFlow(proj.path, proj.id)}
                              disabled={analyzingGit === proj.id}
                            >
                              {analyzingGit === proj.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><GitBranch className="h-3.5 w-3.5 mr-1" />Analisar Git Flow</>}
                            </Button>
                            {gitProfiles[proj.id] && (
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <Badge variant="outline" className="text-[10px]">base: {gitProfiles[proj.id].baseBranch}</Badge>
                                <Badge variant="outline" className="text-[10px]">gh: {gitProfiles[proj.id].ghAccount}</Badge>
                                {gitProfiles[proj.id].hasPrTemplate && (
                                  <Badge variant="outline" className="text-[10px] text-green-600">PR template</Badge>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
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
