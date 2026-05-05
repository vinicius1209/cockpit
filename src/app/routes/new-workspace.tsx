import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CockpitPageHeader } from '@/widgets/cockpit-page-header'
import { Plus, ArrowLeft, Rocket } from 'lucide-react'

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#06b6d4', '#f97316']

export function NewWorkspacePage() {
  const navigate = useNavigate()
  const { addWorkspace } = useWorkspaceStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLORS[0])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    addWorkspace({ name: name.trim(), slug, description: description.trim() || null, color, icon: null })
    navigate('/')
  }

  const previewSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || '—'

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <CockpitPageHeader
        systemLabel="LAUNCHPAD · NOVO WORKSPACE"
        title="Novo Workspace"
        subtitle="Cabine independente com seu proprio board, agentes e projetos"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── IDENTIFICACAO ── */}
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>━ Identificacao</span>
          </div>
          <div className="p-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Cliente X · Portfolio · Projeto Interno"
                autoFocus
              />
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
                slug: <span className="text-muted-foreground">{previewSlug}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Descricao</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: CRM React + Supabase, PJ Fixo 6-8h/dia"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Cor de identificacao</Label>
              <div className="flex gap-1.5 items-center">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-7 w-7 rounded-full transition-all ring-1 ring-background ${
                      color === c ? 'scale-125 ring-2 ring-primary ring-offset-2 ring-offset-background' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: c,
                      boxShadow: color === c ? `0 0 12px ${c}` : undefined,
                    }}
                    onClick={() => setColor(c)}
                  />
                ))}
                <span className="ml-2 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {color.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── PREVIEW ── */}
        {name.trim() && (
          <div className="rounded-md border bg-muted/20 px-3 py-2.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-muted-foreground">━ PREVIEW</span>
            <span className="text-muted-foreground/30">·</span>
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-background"
              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }}
            />
            <span className="text-foreground tracking-normal text-sm normal-case font-sans font-semibold">{name}</span>
            {description.trim() && (
              <span className="ml-auto text-muted-foreground/70 normal-case tracking-normal text-[11px] truncate max-w-[40%]">
                {description}
              </span>
            )}
          </div>
        )}

        {/* ── ACTIONS ── */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Voltar
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Lancar workspace
            <Rocket className="h-3.5 w-3.5 ml-1.5 opacity-70" />
          </Button>
        </div>
      </form>
    </div>
  )
}
