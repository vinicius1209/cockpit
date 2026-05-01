import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Doc, DocInsert } from './types'
import { createStorageAdapter } from '@/shared/lib/persistence'

interface DocState {
  docs: Doc[]
  addDoc: (data: DocInsert) => string
  updateDoc: (id: string, data: Partial<Doc>) => void
  deleteDoc: (id: string) => void
  getWorkspaceDocs: (workspaceId: string) => Doc[]
  getCardDocs: (cardId: string) => Doc[]
  searchDocs: (workspaceId: string, query: string) => Doc[]
}

export const useDocStore = create<DocState>()(
  persist(
    (set, get) => ({
      docs: [],

      addDoc: (data) => {
        const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        const doc: Doc = {
          ...data,
          id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ docs: [...state.docs, doc] }))
        return id
      },

      updateDoc: (id, data) => {
        set((state) => ({
          docs: state.docs.map((d) =>
            d.id === id ? { ...d, ...data, updated_at: new Date().toISOString() } : d,
          ),
        }))
      },

      deleteDoc: (id) => {
        set((state) => ({ docs: state.docs.filter((d) => d.id !== id) }))
      },

      getWorkspaceDocs: (workspaceId) => {
        return get()
          .docs.filter((d) => d.workspace_id === workspaceId)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      },

      getCardDocs: (cardId) => {
        return get().docs.filter((d) => d.card_id === cardId)
      },

      searchDocs: (workspaceId, query) => {
        const q = query.toLowerCase()
        return get()
          .docs.filter(
            (d) =>
              d.workspace_id === workspaceId &&
              (d.title.toLowerCase().includes(q) ||
                d.content.toLowerCase().includes(q) ||
                d.tags.some((t) => t.toLowerCase().includes(q))),
          )
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      },
    }),
    {
      name: 'cockpit-docs',
      version: 1,
      storage: createStorageAdapter(),
      migrate: (persisted) => persisted as DocState,
    },
  ),
)
