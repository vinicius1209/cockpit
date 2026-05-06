import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/widgets/sidebar/app-sidebar'
import { AppHeader } from '@/widgets/header/app-header'
import { Toaster } from '@/components/ui/sonner'
import { CommandPalette, useCommandPalette } from '@/widgets/command-palette/command-palette'
import { FirstRunWizard } from '@/widgets/onboarding/first-run-wizard'
import { useFirstRun } from '@/widgets/onboarding/use-first-run'

// Daemon status moved to sidebar footer (single source of truth — avoids
// the previous root-layout banner that could disagree with the sidebar LED).
export function RootLayout() {
  const { open, setOpen } = useCommandPalette()
  const firstRun = useFirstRun()
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
      <FirstRunWizard open={firstRun.open} onClose={() => firstRun.setOpen(false)} />
    </SidebarProvider>
  )
}
