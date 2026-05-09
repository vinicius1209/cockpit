// Command Palette (Cmd+K) — global navigation + actions cockpit-style.
//
// Escolhas de design:
// - cmdk fuzzy search nativo nos labels + aliases
// - Grupos: Workspaces / Cards / Ações / Navegar
// - Sempre lista cards do workspace ativo no topo (mais comum)
// - Atalhos visuais a direita (G B = go board, etc) ensinam aos poucos
// - Esc fecha; Enter executa; setas navegam

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useCardStore } from '@/entities/card/store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import {
  LayoutDashboard, Activity, Sparkles, BarChart3, BookOpen, Settings,
  PlusCircle, Folders, FileText, Search, Archive,
} from 'lucide-react'

const TYPE_LABEL: Record<string, string> = {
  feature: 'FEAT', bugfix: 'BUG', hotfix: 'HOTFIX',
  discovery: 'DISC', chore: 'CHORE', improvement: 'IMP',
}
const PRIO_LABEL: Record<string, string> = {
  critical: 'CRIT', high: 'HIGH', medium: 'MED', low: 'LOW',
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore()
  const { cards } = useCardStore()
  const [search, setSearch] = useState('')

  const activeWs = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId),
    [workspaces, activeWorkspaceId],
  )

  // Top cards do ws ativo (limitado), sem archived
  const wsCards = useMemo(() => {
    if (!activeWs) return []
    return cards
      .filter((c) => c.workspace_id === activeWs.id && !c.archived_at)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 12)
  }, [cards, activeWs])

  // Cards de outros workspaces — soh quando o usuario digita algo
  const crossWsCards = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return cards
      .filter((c) =>
        !c.archived_at
        && c.workspace_id !== activeWs?.id
        && c.title.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [cards, search, activeWs])

  const handleSelect = (action: () => void) => {
    action()
    onOpenChange(false)
    setSearch('')
  }

  const goCard = (cardId: string, wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId)
    if (!ws) return
    if (ws.id !== activeWorkspaceId) setActiveWorkspace(ws.id)
    // Use search params pra abrir o card via dialog (workspace.tsx já escuta cardId)
    navigate(`/workspace/${ws.id}?cardId=${encodeURIComponent(cardId)}`)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Pesquise cards, workspaces e dispare ações rapidas"
    >
      <CommandInput
        placeholder="Cards, workspaces, ações..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>nenhum match — tente outro termo</CommandEmpty>

        {/* CARDS DO WORKSPACE ATIVO */}
        {activeWs && wsCards.length > 0 && (
          <CommandGroup heading={`Cards · ${activeWs.name}`}>
            {wsCards.map((card) => {
              const shortId = card.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
              return (
                <CommandItem
                  key={card.id}
                  value={`#${shortId} ${card.title} ${card.type} ${card.priority}`}
                  onSelect={() => handleSelect(() => goCard(card.id, card.workspace_id))}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">#{shortId}</span>
                  <span className="flex-1 truncate">{card.title}</span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                    {TYPE_LABEL[card.type]} · P:{PRIO_LABEL[card.priority]}
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {/* CARDS CROSS-WORKSPACE (so com search) */}
        {crossWsCards.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Cards (outros workspaces)">
              {crossWsCards.map((card) => {
                const ws = workspaces.find((w) => w.id === card.workspace_id)
                const shortId = card.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
                return (
                  <CommandItem
                    key={card.id}
                    value={`#${shortId} ${card.title} ${ws?.slug || ''}`}
                    onSelect={() => handleSelect(() => goCard(card.id, card.workspace_id))}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">#{shortId}</span>
                    <span className="flex-1 truncate">{card.title}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
                      {ws?.slug || '?'}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}

        {/* WORKSPACES */}
        <CommandSeparator />
        <CommandGroup heading="Workspaces">
          {workspaces.map((ws) => (
            <CommandItem
              key={ws.id}
              value={`workspace ${ws.name} ${ws.slug} ${ws.description || ''}`}
              onSelect={() => handleSelect(() => {
                setActiveWorkspace(ws.id)
                navigate(`/workspace/${ws.id}`)
              })}
            >
              <Folders className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{ws.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">#{ws.slug}</span>
              {ws.id === activeWorkspaceId && (
                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-500">ativo</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* ACOES */}
        <CommandSeparator />
        <CommandGroup heading="Ações">
          <CommandItem
            value="novo card criar"
            onSelect={() => handleSelect(() => {
              if (activeWs) navigate(`/workspace/${activeWs.id}?new=1`)
            })}
          >
            <PlusCircle className="h-4 w-4 text-muted-foreground" />
            <span>Novo card{activeWs ? ` em ${activeWs.name}` : ''}</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="archived descartados ver"
            onSelect={() => handleSelect(() => {
              if (activeWs) navigate(`/workspace/${activeWs.id}?archived=1`)
            })}
          >
            <Archive className="h-4 w-4 text-muted-foreground" />
            <span>Ver cards descartados</span>
          </CommandItem>
        </CommandGroup>

        {/* NAVEGAR */}
        <CommandSeparator />
        <CommandGroup heading="Navegar">
          <CommandItem value="dashboard go d" onSelect={() => handleSelect(() => navigate('/'))}>
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
            <span>Dashboard</span>
            <CommandShortcut>g d</CommandShortcut>
          </CommandItem>
          <CommandItem value="live agents go a" onSelect={() => handleSelect(() => navigate('/live-agents'))}>
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span>Live Agents</span>
            <CommandShortcut>g a</CommandShortcut>
          </CommandItem>
          {activeWs && (
            <CommandItem value="board kanban go b" onSelect={() => handleSelect(() => navigate(`/workspace/${activeWs.id}`))}>
              <Folders className="h-4 w-4 text-muted-foreground" />
              <span>Board {activeWs.name}</span>
              <CommandShortcut>g b</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem value="discovery go discovery" onSelect={() => handleSelect(() => navigate('/discovery'))}>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span>Discovery</span>
          </CommandItem>
          <CommandItem value="metrics metricas go m" onSelect={() => handleSelect(() => navigate('/metrics'))}>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span>Metricas</span>
            <CommandShortcut>g m</CommandShortcut>
          </CommandItem>
          <CommandItem value="docs vault go" onSelect={() => handleSelect(() => navigate('/docs'))}>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span>Docs Vault</span>
          </CommandItem>
          <CommandItem value="settings configurações go s" onSelect={() => handleSelect(() => navigate('/settings'))}>
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span>Configuracoes</span>
            <CommandShortcut>g s</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

void Search

// Hook pra plugar no layout: monta listener Cmd+K (Mac) e Ctrl+K (Win/Linux),
// além de atalhos sequenciais "g d" / "g a" / "g b" estilo Vim.
export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { activeWorkspaceId } = useWorkspaceStore()

  useEffect(() => {
    let lastG = 0
    const onKey = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }

      // Atalhos "g <letra>" — soh quando focus não ta em input/textarea/contenteditable
      const target = e.target as HTMLElement
      const inEditable = target?.tagName === 'INPUT'
        || target?.tagName === 'TEXTAREA'
        || target?.isContentEditable
      if (inEditable || open) return

      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        lastG = Date.now()
        return
      }
      // Dentro de 800ms após g, capta a 2a letra
      if (lastG && Date.now() - lastG < 800) {
        if (e.key === 'd') { navigate('/'); lastG = 0 }
        else if (e.key === 'a') { navigate('/live-agents'); lastG = 0 }
        else if (e.key === 'b' && activeWorkspaceId) { navigate(`/workspace/${activeWorkspaceId}`); lastG = 0 }
        else if (e.key === 'm') { navigate('/metrics'); lastG = 0 }
        else if (e.key === 's') { navigate('/settings'); lastG = 0 }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, activeWorkspaceId, open])

  return { open, setOpen }
}
