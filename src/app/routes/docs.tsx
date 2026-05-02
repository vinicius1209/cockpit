import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MessageResponse } from '@/components/ai-elements/message'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useDocStore } from '@/entities/docs/store'
import { useProjectStore } from '@/entities/card/project-store'
import { DOC_TEMPLATES } from '@/entities/docs/templates'
import type { Doc } from '@/entities/docs/types'
import { FileText, Plus, Search, Trash2, Edit, BookOpen, Eye, Pencil, FolderOpen, Link2, Filter } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

export function DocsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { getWorkspaceDocs, searchDocs, addDoc, updateDoc, deleteDoc } = useDocStore()
  const { getWorkspaceProjects } = useProjectStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null)
  const [viewingDoc, setViewingDoc] = useState<Doc | null>(null)
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('edit')

  // Filters
  const [filterSource, setFilterSource] = useState<string>('all')
  const [filterProject, setFilterProject] = useState<string>('all')

  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [source, setSource] = useState<'manual' | 'jira-mirror'>('manual')
  const [sourceRef, setSourceRef] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('blank')

  if (!activeWorkspaceId) {
    return <div className="p-6 text-muted-foreground">Selecione um workspace na sidebar</div>
  }

  const projects = getWorkspaceProjects(activeWorkspaceId)

  let docs = searchQuery
    ? searchDocs(activeWorkspaceId, searchQuery)
    : getWorkspaceDocs(activeWorkspaceId)

  // Apply filters
  if (filterSource !== 'all') {
    docs = docs.filter((d) => d.source === filterSource)
  }
  if (filterProject !== 'all') {
    docs = docs.filter((d) => d.project_id === filterProject)
  }

  const sourceCountMap = getWorkspaceDocs(activeWorkspaceId).reduce((acc, d) => {
    acc[d.source] = (acc[d.source] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const openNew = () => {
    setEditingDoc(null)
    setTitle('')
    setContent('')
    setTags('')
    setSource('manual')
    setSourceRef('')
    setSelectedTemplate('blank')
    setViewMode('edit')
    setDialogOpen(true)
  }

  const openEdit = (doc: Doc) => {
    setEditingDoc(doc)
    setTitle(doc.title)
    setContent(doc.content)
    setTags(doc.tags.join(', '))
    setSource(doc.source as 'manual' | 'jira-mirror')
    setSourceRef(doc.source_ref || '')
    setViewMode(doc.content.trim() ? 'preview' : 'edit')
    setDialogOpen(true)
    setViewingDoc(null)
  }

  const handleSave = () => {
    if (!title.trim()) return
    const tagsList = tags.split(',').map((t) => t.trim()).filter(Boolean)

    if (editingDoc) {
      updateDoc(editingDoc.id, {
        title: title.trim(),
        content,
        tags: tagsList,
        source,
        source_ref: sourceRef.trim() || null,
      })
      toast.success('Documento salvo')
    } else {
      addDoc({
        workspace_id: activeWorkspaceId,
        project_id: null,
        title: title.trim(),
        content,
        tags: tagsList,
        source,
        source_ref: sourceRef.trim() || null,
        card_id: null,
      })
      toast.success('Documento criado')
    }
    setDialogOpen(false)
  }

  const handleDelete = (id: string) => {
    deleteDoc(id)
    setViewingDoc(null)
    toast.success('Documento excluido')
  }

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = DOC_TEMPLATES.find((t) => t.id === templateId)
    if (template && template.content) {
      setContent(template.content)
      if (!title.trim() && template.id !== 'blank') {
        setTitle(template.name)
      }
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Docs Vault
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {docs.length} documento{docs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Doc
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por titulo, conteudo ou tag..."
            className="pl-9"
          />
        </div>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-36 h-9">
            <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            <SelectItem value="manual">Manual {sourceCountMap['manual'] ? `(${sourceCountMap['manual']})` : ''}</SelectItem>
            <SelectItem value="jira-mirror">Jira {sourceCountMap['jira-mirror'] ? `(${sourceCountMap['jira-mirror']})` : ''}</SelectItem>
            <SelectItem value="agent-generated">AI {sourceCountMap['agent-generated'] ? `(${sourceCountMap['agent-generated']})` : ''}</SelectItem>
          </SelectContent>
        </Select>
        {projects.length > 0 && (
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-36 h-9">
              <FolderOpen className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos projetos</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Doc list */}
      <div className="space-y-2">
        {docs.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{searchQuery ? 'Nenhum resultado encontrado' : 'Nenhum documento criado'}</p>
            {!searchQuery && (
              <p className="text-xs mt-1">Clique em "Novo Doc" para comecar</p>
            )}
          </div>
        )}

        {docs.map((doc) => (
          <div
            key={doc.id}
            className="group flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setViewingDoc(doc)}
          >
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium truncate">{doc.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {doc.content.slice(0, 150).replace(/[#*`\n]/g, ' ').trim()}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {doc.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                ))}
                {doc.tags.length > 3 && (
                  <Badge variant="outline" className="text-[10px]">+{doc.tags.length - 3}</Badge>
                )}
                {doc.source !== 'manual' && (
                  <Badge variant="outline" className="text-[10px]">{doc.source === 'agent-generated' ? 'AI' : doc.source}</Badge>
                )}
                {doc.card_id && (
                  <Badge variant="outline" className="text-[10px]">
                    <Link2 className="h-2.5 w-2.5 mr-0.5" />
                    card
                  </Badge>
                )}
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {format(new Date(doc.updated_at), 'dd/MM')}
            </span>
          </div>
        ))}
      </div>

      {/* View doc dialog */}
      <Dialog open={!!viewingDoc} onOpenChange={(v) => !v && setViewingDoc(null)}>
        <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col">
          {viewingDoc && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingDoc.title}</DialogTitle>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {viewingDoc.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                  <Badge variant="outline" className="text-[10px]">{viewingDoc.source}</Badge>
                  {viewingDoc.source_ref && (
                    <Badge variant="outline" className="text-[10px]">{viewingDoc.source_ref}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(viewingDoc.updated_at), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="prose prose-sm dark:prose-invert max-w-none py-2">
                  <MessageResponse>{viewingDoc.content}</MessageResponse>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t shrink-0">
                <Button variant="outline" size="sm" onClick={() => openEdit(viewingDoc)}>
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Editar
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(viewingDoc.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Excluir
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-3xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'Editar Documento' : 'Novo Documento'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Template selector (only for new docs) */}
            {!editingDoc && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Template:</span>
                {DOC_TEMPLATES.map((t) => (
                  <Badge
                    key={t.id}
                    variant={selectedTemplate === t.id ? 'default' : 'outline'}
                    className="cursor-pointer text-[10px]"
                    onClick={() => handleTemplateChange(t.id)}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Titulo</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titulo do documento..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Origem</Label>
                <Select value={source} onValueChange={(v) => setSource(v as 'manual' | 'jira-mirror')}>
                  <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="jira-mirror">Jira</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ref</Label>
                <Input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="PROJ-123" className="w-28 h-9" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tags (separadas por virgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="backend, auth, sprint-12" className="h-9" />
            </div>
          </div>

          {/* Content with Preview/Edit toggle */}
          <div className="flex items-center justify-between pt-1">
            <Label className="text-xs">Conteudo</Label>
            {content.trim() && (
              <div className="flex rounded-md border overflow-hidden">
                <button
                  className={`px-2 py-1 text-[11px] flex items-center gap-1 transition-colors ${viewMode === 'preview' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setViewMode('preview')}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </button>
                <button
                  className={`px-2 py-1 text-[11px] flex items-center gap-1 transition-colors ${viewMode === 'edit' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setViewMode('edit')}
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
            {viewMode === 'preview' && content.trim() ? (
              <div className="prose prose-sm dark:prose-invert max-w-none p-3 border rounded-md flex-1 overflow-y-auto bg-muted/10">
                <MessageResponse>{content}</MessageResponse>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Conteudo do documento em markdown..."
                className="flex-1 resize-none font-mono text-sm"
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 justify-end pt-2 border-t shrink-0">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={!title.trim()}>
              {editingDoc ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
