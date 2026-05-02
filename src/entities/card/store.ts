import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Card, CardInsert, BoardColumn, Label } from './types'
import { DEFAULT_COLUMNS } from '@/shared/lib/constants'
import { createStorageAdapter } from '@/shared/lib/persistence'

interface CardState {
  cards: Card[]
  columns: Record<string, BoardColumn[]>
  labels: Record<string, Label[]>
  addCard: (data: CardInsert) => string
  updateCard: (id: string, data: Partial<Card>) => void
  deleteCard: (id: string) => void
  moveCard: (cardId: string, toColumnId: string, newPosition: number) => void
  reorderCards: (columnId: string, cardIds: string[]) => void
  getColumnCards: (workspaceId: string, columnId: string) => Card[]
  getWorkspaceColumns: (workspaceId: string) => BoardColumn[]
  initWorkspaceColumns: (workspaceId: string) => void
  addLabel: (workspaceId: string, name: string, color: string) => string
  deleteLabel: (workspaceId: string, labelId: string) => void
  getWorkspaceLabels: (workspaceId: string) => Label[]
  toggleColumnAutomation: (workspaceId: string, columnId: string, automationId: string) => void
  toggleCardLabel: (cardId: string, label: Label) => void
}

export const useCardStore = create<CardState>()(
  persist(
    (set, get) => ({
      cards: [],
      columns: {},
      labels: {},

      addCard: (data) => {
        const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const card: Card = {
          ...data,
          id,
          labels: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        set((state) => ({ cards: [...state.cards, card] }))
        return id
      },

      updateCard: (id, data) => {
        set((state) => ({
          cards: state.cards.map((c) =>
            c.id === id ? { ...c, ...data, updated_at: new Date().toISOString() } : c,
          ),
        }))
      },

      deleteCard: (id) => {
        set((state) => ({ cards: state.cards.filter((c) => c.id !== id) }))
      },

      moveCard: (cardId, toColumnId, newPosition) => {
        set((state) => ({
          cards: state.cards.map((c) =>
            c.id === cardId
              ? { ...c, column_id: toColumnId, position: newPosition, updated_at: new Date().toISOString() }
              : c,
          ),
        }))
      },

      reorderCards: (columnId, cardIds) => {
        set((state) => ({
          cards: state.cards.map((c) => {
            if (c.column_id !== columnId) return c
            const idx = cardIds.indexOf(c.id)
            if (idx === -1) return c
            return { ...c, position: idx, updated_at: new Date().toISOString() }
          }),
        }))
      },

      getColumnCards: (workspaceId, columnId) => {
        return get()
          .cards.filter((c) => c.workspace_id === workspaceId && c.column_id === columnId)
          .sort((a, b) => a.position - b.position)
      },

      getWorkspaceColumns: (workspaceId) => {
        const cols = get().columns[workspaceId]
        if (!cols || cols.length === 0) {
          get().initWorkspaceColumns(workspaceId)
          return get().columns[workspaceId] || []
        }
        return cols.sort((a, b) => a.position - b.position)
      },

      initWorkspaceColumns: (workspaceId) => {
        const existing = get().columns[workspaceId]
        if (existing && existing.length > 0) return

        const cols: BoardColumn[] = DEFAULT_COLUMNS.map((col) => ({
          id: `col-${workspaceId}-${col.slug}`,
          workspace_id: workspaceId,
          name: col.name,
          slug: col.slug,
          position: col.position,
          color: col.color,
          automations: col.automations || [],
          created_at: new Date().toISOString(),
        }))

        set((state) => ({
          columns: { ...state.columns, [workspaceId]: cols },
        }))
      },

      addLabel: (workspaceId, name, color) => {
        const id = `lbl-${Date.now()}`
        const label: Label = { id, workspace_id: workspaceId, name, color }
        set((state) => ({
          labels: {
            ...state.labels,
            [workspaceId]: [...(state.labels[workspaceId] || []), label],
          },
        }))
        return id
      },

      deleteLabel: (workspaceId, labelId) => {
        set((state) => ({
          labels: {
            ...state.labels,
            [workspaceId]: (state.labels[workspaceId] || []).filter((l) => l.id !== labelId),
          },
          cards: state.cards.map((c) => ({
            ...c,
            labels: c.labels.filter((cl) => cl.label_id !== labelId),
          })),
        }))
      },

      getWorkspaceLabels: (workspaceId) => {
        return get().labels[workspaceId] || []
      },

      toggleCardLabel: (cardId, label) => {
        set((state) => ({
          cards: state.cards.map((c) => {
            if (c.id !== cardId) return c
            const exists = c.labels.some((cl) => cl.label_id === label.id)
            return {
              ...c,
              labels: exists
                ? c.labels.filter((cl) => cl.label_id !== label.id)
                : [...c.labels, { card_id: cardId, label_id: label.id, label }],
              updated_at: new Date().toISOString(),
            }
          }),
        }))
      },

      toggleColumnAutomation: (workspaceId, columnId, automationId) => {
        set((state) => ({
          columns: {
            ...state.columns,
            [workspaceId]: (state.columns[workspaceId] || []).map((col) => {
              if (col.id !== columnId) return col
              return {
                ...col,
                automations: (col.automations || []).map((a) =>
                  a.id === automationId ? { ...a, enabled: !a.enabled } : a,
                ),
              }
            }),
          },
        }))
      },
    }),
    {
      name: 'cockpit-cards',
      version: 2,
      storage: createStorageAdapter(),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>
        // v1 → v2: add automations to existing columns
        if (state?.columns && typeof state.columns === 'object') {
          const cols = state.columns as Record<string, Array<Record<string, unknown>>>
          for (const wsId of Object.keys(cols)) {
            cols[wsId] = cols[wsId].map((col) => ({
              ...col,
              automations: col.automations ?? [],
            }))
          }
        }
        return state as unknown as CardState
      },
    },
  ),
)
