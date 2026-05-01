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
import { useState, useEffect } from 'react'
import { ArrowLeft, Trash2, Plus, GripVertical, X, FolderOpen, Search, Loader2 } from 'lucide-react'
import { daemonClient } from '@/shared/lib/daemon-client'
import type { InstalledAgent } from '@/entities/card/project-types'

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#f97316']
const LABEL_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { workspaces, updateWorkspace, deleteWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const { getWorkspaceLabels, addLabel, deleteLabel, getWorkspaceColumns } = useCardStore()
  const { getWorkspaceProjects, addProject, deleteProject } = useProjectStore()

  const workspace = workspaces.find((w) => w.id === workspaceId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0])
  const [saved, setSaved] = useState(false)

  // Project form
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectPath, setNewProjectPath] = useState('')
  const [availableAgents, setAvailableAgents] = useState<InstalledAgent[]>([])
  const [daemonOnline, setDaemonOnline] = useState<boolean | null>(null)
  const [scanning, setScanning] = useState<string | null>(null)

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
      .then(() => {
        setDaemonOnline(true)
        return daemonClient.getAvailableAgents()
      })
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
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDelete = () => {
    deleteWorkspace(workspaceId)
    navigate('/')
  }

  const handleAddLabel = () => {
    if (!newLabelName.trim()) return
    addLabel(workspaceId, newLabelName.trim(), newLabelColor)
    setNewLabelName('')
  }

  const handleAddProject = async () => {
    if (!newProjectPath.trim()) return
    const projectName = newProjectName.trim() || newProjectPath.split('/').pop() || 'Projeto'

    addProject({
      workspace_id: workspaceId,
      name: projectName,
      path: newProjectPath.trim(),
      agent_preference: null,
      auto_scan: false,
      scan_interval_hours: 4,
    })
    setNewProjectName('')
    setNewProjectPath('')
  }

  const handleScanProject = async (projectPath: string, projectId: string) => {
    setScanning(projectId)
    try {
      await daemonClient.scanProject(projectPath)
    } catch {
      // scan error
    } finally {
      setScanning(null)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/workspace/${workspaceId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Configuracoes</h1>
          <p className="text-sm text-muted-foreground">{workspace.name}</p>
        </div>
      </div>

      {/* Daemon status */}
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${daemonOnline ? 'bg-green-500' : daemonOnline === false ? 'bg-red-500' : 'bg-yellow-500'}`} />
        <span className="text-muted-foreground">
          {daemonOnline ? 'Daemon conectado' : daemonOnline === false ? 'Daemon offline — rode: cd cockpit/daemon && bun dev' : 'Verificando daemon...'}
        </span>
        {daemonOnline && availableAgents.length > 0 && (
          <div className="flex gap-1 ml-2">
            {availableAgents.map((a) => (
              <Badge key={a.name} variant="outline" className="text-[10px]">
                {a.name} {a.version?.split(' ')[0]}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Info basica */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informacoes</CardTitle>
          <CardDescription>Dados basicos do workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Nome</Label>
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-desc">Descricao</Label>
            <Textarea id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-8 w-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-offset-background ring-primary' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {saved ? 'Salvo!' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Projetos
          </CardTitle>
          <CardDescription>Projetos vinculados a este workspace. Usado para discovery e scan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Nome (opcional)"
              className="w-36"
            />
            <Input
              value={newProjectPath}
              onChange={(e) => setNewProjectPath(e.target.value)}
              placeholder="~/projetos/meu-projeto"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
            />
            <Button size="sm" onClick={handleAddProject} disabled={!newProjectPath.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((proj) => (
                <div key={proj.id} className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/30">
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{proj.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{proj.path}</p>
                  </div>
                  {daemonOnline && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      onClick={() => handleScanProject(proj.path, proj.id)}
                      disabled={scanning === proj.id}
                    >
                      {scanning === proj.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
                      Scan
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteProject(proj.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum projeto registrado</p>
          )}
        </CardContent>
      </Card>

      {/* Labels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Labels</CardTitle>
          <CardDescription>Labels disponiveis neste workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="Nome da label..."
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
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
            <Button size="sm" onClick={handleAddLabel} disabled={!newLabelName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Criar
            </Button>
          </div>
          {labels.length > 0 ? (
            <div className="space-y-2">
              {labels.map((label) => (
                <div key={label.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} />
                    <span className="text-sm">{label.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteLabel(workspaceId, label.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma label criada</p>
          )}
        </CardContent>
      </Card>

      {/* Colunas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colunas do Board</CardTitle>
          <CardDescription>Colunas kanban deste workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {columns.map((col) => (
              <div key={col.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color ?? '#6b7280' }} />
                <span className="text-sm flex-1">{col.name}</span>
                <Badge variant="outline" className="text-[10px]">{col.slug}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Zona de perigo */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona de Perigo</CardTitle>
          <CardDescription>Acoes irreversiveis</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir Workspace
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
