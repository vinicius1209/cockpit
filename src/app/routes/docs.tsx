import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useDocStore } from '@/entities/docs/store'
import type { Doc } from '@/entities/docs/types'
import { FileText, Plus, Search, Trash2, Edit, BookOpen } from 'lucide-react'
import { format } from 'date-fns'

export function DocsPage() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { getWorkspaceDocs, searchDocs, addDoc, updateDoc, deleteDoc } = useDocStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null)
  const [viewingDoc, setViewingDoc] = useState<Doc | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [source, setSource] = useState<'manual' | 'jira-mirror'>('manual')
  const [sourceRef, setSourceRef] = useState('')

  if (!activeWorkspaceId) {
    return <div className="p-6 text-muted-foreground">Selecione um workspace na sidebar</div>
  }

  const docs = searchQuery
    ? searchDocs(activeWorkspaceId, searchQuery)
    : getWorkspaceDocs(activeWorkspaceId)

  const openNew = () => {
    setEditingDoc(null)
    setTitle('')
    setContent('')
    setTags('')
    setSource('manual')
    setSourceRef('')
    setDialogOpen(true)
  }

  const openEdit = (doc: Doc) => {
    setEditingDoc(doc)
    setTitle(doc.title)
    setContent(doc.content)
    setTags(doc.tags.join(', '))
    setSource(doc.source as 'manual' | 'jira-mirror')
    setSourceRef(doc.source_ref || '')
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
    }
    setDialogOpen(false)
  }

  const handleDelete = (id: string) => {
    deleteDoc(id)
    setViewingDoc(null)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Docs Vault
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Base de conhecimento, stories e documentacao
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Doc
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por titulo, conteudo ou tag..."
          className="pl-9"
        />
      </div>

      {/* Doc list */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-3">
          {docs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{searchQuery ? 'Nenhum resultado encontrado' : 'Nenhum documento criado'}</p>
            </div>
          )}

          {docs.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setViewingDoc(doc)}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-medium truncate">{doc.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {doc.content.slice(0, 200)}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {doc.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                      ))}
                      <Badge variant="outline" className="text-[10px]">{doc.source}</Badge>
                      {doc.source_ref && (
                        <Badge variant="outline" className="text-[10px]">{doc.source_ref}</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(doc.updated_at), 'dd/MM HH:mm')}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* View doc dialog */}
      <Dialog open={!!viewingDoc} onOpenChange={(v) => !v && setViewingDoc(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          {viewingDoc && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingDoc.title}</DialogTitle>
                <div className="flex items-center gap-2 pt-1">
                  {viewingDoc.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                  <Badge variant="outline" className="text-[10px]">{viewingDoc.source}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(viewingDoc.updated_at), 'dd/MM/yyyy HH:mm')}
                  </span>
                </div>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh]">
                <div className="whitespace-pre-wrap text-sm py-2">{viewingDoc.content}</div>
              </ScrollArea>
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => openEdit(viewingDoc)}>
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Editar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(viewingDoc.id)}>
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'Editar Documento' : 'Novo Documento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titulo do documento..." autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select value={source} onValueChange={(v) => setSource(v as 'manual' | 'jira-mirror')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="jira-mirror">Espelho Jira</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referencia (ex: JIRA-123)</Label>
                <Input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="PROJ-123" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags (separadas por virgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="backend, auth, sprint-12" />
            </div>

            <div className="space-y-2">
              <Label>Conteudo</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Conteudo do documento em markdown..."
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!title.trim()}>
                {editingDoc ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
