import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { LayoutDashboard, Settings, Plus, Briefcase, Sparkles, BarChart3, BookOpen } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

export function AppSidebar() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleWorkspaceClick = (id: string) => {
    setActiveWorkspace(id)
    navigate(`/workspace/${id}`)
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            VM
          </div>
          <div>
            <p className="text-sm font-semibold">Cockpit</p>
            <p className="text-xs text-muted-foreground">VM Solucoes</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Geral</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === '/'}
                  onClick={() => navigate('/')}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === '/discovery'}
                  onClick={() => navigate('/discovery')}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Discovery</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === '/metrics'}
                  onClick={() => navigate('/metrics')}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Metricas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === '/docs'}
                  onClick={() => navigate('/docs')}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Docs Vault</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === '/settings'}
                  onClick={() => navigate('/settings')}
                >
                  <Settings className="h-4 w-4" />
                  <span>Configuracoes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaces.map((ws) => (
                <SidebarMenuItem key={ws.id}>
                  <SidebarMenuButton
                    isActive={activeWorkspaceId === ws.id}
                    onClick={() => handleWorkspaceClick(ws.id)}
                  >
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: ws.color }}
                    />
                    <span>{ws.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-muted-foreground"
                  onClick={() => navigate('/workspace/new')}
                >
                  <Plus className="h-4 w-4" />
                  <span>Novo workspace</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Briefcase className="h-3.5 w-3.5" />
          <span>VM Solucoes CNPJ</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
