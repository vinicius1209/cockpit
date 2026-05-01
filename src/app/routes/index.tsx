import { Routes, Route } from 'react-router-dom'
import { RootLayout } from '@/app/layout/root-layout'
import { DashboardPage } from './dashboard'
import { WorkspacePage } from './workspace'
import { NewWorkspacePage } from './new-workspace'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workspace/new" element={<NewWorkspacePage />} />
        <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
        <Route path="/settings" element={<div className="p-6 text-muted-foreground">Configuracoes - em breve</div>} />
      </Route>
    </Routes>
  )
}
