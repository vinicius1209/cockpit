import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { Moon, Sun, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/shared/hooks/use-theme'
import { useNavigate } from 'react-router-dom'

export function AppHeader() {
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace())
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()

  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />

        {activeWorkspace && (
          <div className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: activeWorkspace.color }}
            />
            <h1 className="text-sm font-semibold">{activeWorkspace.name}</h1>
            {activeWorkspace.description && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                — {activeWorkspace.description}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hidden md:flex items-center gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors font-mono"
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
          }}
          title="Command Palette"
        >
          <span className="opacity-60">buscar / ir para</span>
          <kbd className="rounded-sm bg-muted px-1 py-0 text-[10px] tracking-wider opacity-70">⌘K</kbd>
        </button>
        {activeWorkspace && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate(`/workspace/${activeWorkspace.id}/settings`)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  )
}
