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
import { LayoutDashboard, Settings, Plus, Sparkles, BarChart3, BookOpen, Activity } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { daemonClient } from '@/shared/lib/daemon-client'
import { useDaemonStatus } from '@/shared/hooks/use-daemon-status'

export function AppSidebar() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Single source of truth: useDaemonStatus (also used elsewhere). Fetch
  // version separately when online — apenas pra mostrar no footer.
  const online = useDaemonStatus()
  const [version, setVersion] = useState<string | undefined>()
  const daemonStatus = { online: online === true, version }

  useEffect(() => {
    if (online !== true) return
    daemonClient.health().then((h) => setVersion(h.version)).catch(() => {})
  }, [online])

  const handleWorkspaceClick = (id: string) => {
    setActiveWorkspace(id)
    navigate(`/workspace/${id}`)
  }

  const generalNav = [
    { path: '/',             label: 'Dashboard',     icon: LayoutDashboard, mono: 'DSH' },
    { path: '/live-agents',  label: 'Live Agents',   icon: Activity,        mono: 'LIV' },
    { path: '/discovery',    label: 'Discovery',     icon: Sparkles,        mono: 'DSC' },
    { path: '/metrics',      label: 'Metricas',      icon: BarChart3,       mono: 'MTR' },
    { path: '/docs',         label: 'Docs Vault',    icon: BookOpen,        mono: 'DOC' },
    { path: '/settings',     label: 'Configuracoes', icon: Settings,        mono: 'CFG' },
  ]

  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* ── Header — system identifier ── */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-[11px] tracking-wide">
            VM
          </div>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold leading-none">Cockpit</p>
              <span className="font-mono text-[9px] text-muted-foreground tabular-nums">v0.0.0</span>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
              vm · solucoes
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* ── PAINEL ── */}
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
            ━ Painel
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {generalNav.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => navigate(item.path)}
                      className="group/item"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      <span
                        className={`font-mono text-[9px] tabular-nums tracking-wider opacity-0 group-hover/item:opacity-50 group-data-[collapsible=icon]:hidden ${
                          isActive ? '!opacity-70' : ''
                        }`}
                      >
                        {item.mono}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── WORKSPACES ── */}
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
            ━ Workspaces
            <span className="ml-auto tabular-nums opacity-60">{String(workspaces.length).padStart(2, '0')}</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaces.map((ws, i) => {
                const isActive = activeWorkspaceId === ws.id
                return (
                  <SidebarMenuItem key={ws.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleWorkspaceClick(ws.id)}
                      className="group/ws"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-sidebar-background transition-shadow"
                        style={{
                          backgroundColor: ws.color,
                          boxShadow: isActive ? `0 0 8px ${ws.color}` : undefined,
                        }}
                      />
                      <span className="flex-1 truncate">{ws.name}</span>
                      <span className="font-mono text-[9px] tabular-nums text-muted-foreground/40 group-data-[collapsible=icon]:hidden">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
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

      {/* ── Footer — daemon telemetry ── */}
      <SidebarFooter className="border-t border-sidebar-border px-3 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] group-data-[collapsible=icon]:hidden">
          <span className="relative flex h-2 w-2">
            {daemonStatus.online && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                daemonStatus.online ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
          </span>
          <span className={daemonStatus.online ? 'text-emerald-500' : 'text-rose-500'}>
            {daemonStatus.online ? 'DAEMON' : 'OFFLINE'}
          </span>
          {daemonStatus.online && daemonStatus.version && (
            <span className="text-muted-foreground/60 normal-case tracking-normal">
              v{daemonStatus.version}
            </span>
          )}
          <Activity className="h-2.5 w-2.5 ml-auto text-muted-foreground/40" />
        </div>
        {/* collapsed mode — just LED */}
        <div className="hidden group-data-[collapsible=icon]:flex justify-center">
          <span
            className={`h-2 w-2 rounded-full ${daemonStatus.online ? 'bg-emerald-500' : 'bg-rose-500'}`}
            title={daemonStatus.online ? `Daemon online v${daemonStatus.version}` : 'Daemon offline'}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
