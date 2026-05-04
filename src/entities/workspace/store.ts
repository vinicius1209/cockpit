import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Workspace } from './types'
import { createStorageAdapter, createDaemonStorageAdapter } from '@/shared/lib/persistence'

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  addWorkspace: (workspace: Omit<Workspace, 'id' | 'created_at' | 'updated_at'>) => void
  updateWorkspace: (id: string, data: Partial<Workspace>) => void
  deleteWorkspace: (id: string) => void
  setActiveWorkspace: (id: string) => void
  getActiveWorkspace: () => Workspace | undefined
}

const SEED_WORKSPACES: Workspace[] = [
  {
    id: 'ws-prime',
    name: 'Prime',
    slug: 'prime',
    description: 'Prime Sales Hub - PJ Fixo',
    color: '#3b82f6',
    icon: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ws-tixfy',
    name: 'Tixfy',
    slug: 'tixfy',
    description: 'Tixfy - Suporte sob demanda',
    color: '#8b5cf6',
    icon: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ws-meuingresso',
    name: 'Meu Ingresso',
    slug: 'meu-ingresso',
    description: 'Meu Ingresso - Suporte sob demanda',
    color: '#f59e0b',
    icon: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ws-sicredi',
    name: 'Sicredi',
    slug: 'sicredi',
    description: 'Sicredi - CLT',
    color: '#10b981',
    icon: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: SEED_WORKSPACES,
      activeWorkspaceId: 'ws-prime',

      addWorkspace: (data) => {
        // Dedup by slug
        const existing = get().workspaces.find((w) => w.slug === data.slug)
        if (existing) return

        const workspace: Workspace = {
          ...data,
          id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ workspaces: [...state.workspaces, workspace] }))
      },

      updateWorkspace: (id, data) => {
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === id ? { ...w, ...data, updated_at: new Date().toISOString() } : w,
          ),
        }))
      },

      deleteWorkspace: (id) => {
        // Cascade: clean up associated data in other stores
        // Uses dynamic import to avoid circular dependency
        import('@/entities/card/store').then(({ useCardStore }) => {
          const cardState = useCardStore.getState()
          // Delete cards belonging to this workspace
          const cardsToDelete = cardState.cards.filter((c) => c.workspace_id === id)
          for (const card of cardsToDelete) cardState.deleteCard(card.id)
          // Columns and labels are keyed by workspace_id — remove them
          useCardStore.setState((s) => {
            const { [id]: _cols, ...restCols } = s.columns
            const { [id]: _lbls, ...restLbls } = s.labels
            return { columns: restCols, labels: restLbls }
          })
        })
        import('@/entities/docs/store').then(({ useDocStore }) => {
          const docs = useDocStore.getState().docs.filter((d) => d.workspace_id === id)
          for (const doc of docs) useDocStore.getState().deleteDoc(doc.id)
        })
        import('@/entities/card/project-store').then(({ useProjectStore }) => {
          const projects = useProjectStore.getState().projects.filter((p) => p.workspace_id === id)
          for (const proj of projects) useProjectStore.getState().deleteProject(proj.id)
        })

        set((state) => {
          const remaining = state.workspaces.filter((w) => w.id !== id)
          return {
            workspaces: remaining,
            activeWorkspaceId: state.activeWorkspaceId === id ? remaining[0]?.id ?? null : state.activeWorkspaceId,
          }
        })
      },

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

      getActiveWorkspace: () => {
        const state = get()
        return state.workspaces.find((w) => w.id === state.activeWorkspaceId)
      },
    }),
    {
      name: 'cockpit-workspaces',
      version: 1,
      storage: createStorageAdapter(createDaemonStorageAdapter('workspaces')),
      migrate: (persisted) => persisted as WorkspaceState,
    },
  ),
)
