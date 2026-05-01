import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, ProjectInsert } from './project-types'
import { createStorageAdapter } from '@/shared/lib/persistence'

interface ProjectState {
  projects: Project[]
  addProject: (data: ProjectInsert) => string
  updateProject: (id: string, data: Partial<Project>) => void
  deleteProject: (id: string) => void
  getWorkspaceProjects: (workspaceId: string) => Project[]
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],

      addProject: (data) => {
        const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        const project: Project = {
          ...data,
          id,
          last_scan_at: null,
          created_at: new Date().toISOString(),
        }
        set((state) => ({ projects: [...state.projects, project] }))
        return id
      },

      updateProject: (id, data) => {
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
        }))
      },

      deleteProject: (id) => {
        set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }))
      },

      getWorkspaceProjects: (workspaceId) => {
        return get().projects.filter((p) => p.workspace_id === workspaceId)
      },
    }),
    {
      name: 'cockpit-projects',
      version: 1,
      storage: createStorageAdapter(),
      migrate: (persisted) => persisted as ProjectState,
    },
  ),
)
