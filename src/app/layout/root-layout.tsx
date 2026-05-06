import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/widgets/sidebar/app-sidebar'
import { AppHeader } from '@/widgets/header/app-header'
import { Toaster } from '@/components/ui/sonner'
import { CommandPalette, useCommandPalette } from '@/widgets/command-palette/command-palette'

// Daemon status moved to sidebar footer (single source of truth — avoids
// the previous root-layout banner that could disagree with the sidebar LED).
export function RootLayout() {
  const { open, setOpen } = useCommandPalette()
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex min-h-0 flex-col overflow-hidden">
        <AppHeader />
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
      <Toaster richColors position="bottom-right" />
      <CommandPalette open={open} onOpenChange={setOpen} />
    </SidebarProvider>
  )
}
