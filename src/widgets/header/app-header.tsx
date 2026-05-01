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
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
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

      <div className="ml-auto flex items-center gap-2">
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
