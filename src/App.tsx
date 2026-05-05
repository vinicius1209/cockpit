import { AppProviders } from '@/app/providers/app-providers'
import { AppRoutes } from '@/app/routes'
import { useSessionReconciliation } from '@/shared/hooks/use-session-reconciliation'

export default function App() {
  // On boot: reidrata processingCards de sessoes que ficaram rodando no
  // daemon enquanto a aba estava fechada. Sem isso, kanban perde LIVE.
  useSessionReconciliation()

  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}
