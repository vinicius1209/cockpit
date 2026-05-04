import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/widgets/sidebar/app-sidebar'
import { AppHeader } from '@/widgets/header/app-header'
import { Toaster } from '@/components/ui/sonner'
import { useDaemonStatus } from '@/shared/hooks/use-daemon-status'
import { AlertCircle } from 'lucide-react'

export function RootLayout() {
  const daemonOnline = useDaemonStatus()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex min-h-0 flex-col overflow-hidden">
        <AppHeader />
        {daemonOnline === false && (
          <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-4 py-1.5 shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="text-xs text-destructive">
              Daemon offline — dados salvos localmente. Inicie com <code className="bg-destructive/10 px-1 rounded text-[11px]">cd daemon && bun dev</code>
            </span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  )
}
