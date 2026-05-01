import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Workspace } from './types'

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
        const workspace: Workspace = {
          ...data,
          id: `ws-${Date.now()}`,
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
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== id),
          activeWorkspaceId: state.activeWorkspaceId === id ? state.workspaces[0]?.id ?? null : state.activeWorkspaceId,
        }))
      },

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

      getActiveWorkspace: () => {
        const state = get()
        return state.workspaces.find((w) => w.id === state.activeWorkspaceId)
      },
    }),
    { name: 'cockpit-workspaces' },
  ),
)
