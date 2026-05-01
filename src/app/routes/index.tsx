import { Routes, Route } from 'react-router-dom'
import { RootLayout } from '@/app/layout/root-layout'
import { DashboardPage } from './dashboard'
import { WorkspacePage } from './workspace'
import { NewWorkspacePage } from './new-workspace'
import { WorkspaceSettingsPage } from './workspace-settings'
import { SettingsPage } from './settings'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workspace/new" element={<NewWorkspacePage />} />
        <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
        <Route path="/workspace/:workspaceId/settings" element={<WorkspaceSettingsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
