import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Card, CardInsert, BoardColumn, Label } from './types'
import { DEFAULT_COLUMNS } from '@/shared/lib/constants'
import { createStorageAdapter, createDaemonStorageAdapter } from '@/shared/lib/persistence'

export interface ProcessingState {
  cardId: string
  action: string
  status: 'running' | 'done' | 'error'
  chunks: string[]
  startedAt: string
  // Optional metadata used by N2/N4 — session id no daemon, agent label, model
  sessionId?: string
  agent?: string
  model?: string
  // Last error message when status === 'error'
  error?: string
  // Abort handler — runtime only (not serialized)
  abort?: () => void
}

interface CardState {
  cards: Card[]
  columns: Record<string, BoardColumn[]>
  labels: Record<string, Label[]>
  processingCards: Record<string, ProcessingState>
  addCard: (data: CardInsert) => string
  updateCard: (id: string, data: Partial<Card>) => void
  deleteCard: (id: string) => void
  archiveCard: (id: string) => void
  unarchiveCard: (id: string) => void
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
  startProcessing: (cardId: string, action: string, meta?: Partial<Pick<ProcessingState, 'sessionId' | 'agent' | 'model' | 'abort'>>) => void
  addProcessingChunk: (cardId: string, text: string) => void
  errorProcessing: (cardId: string, error: string) => void
  completeProcessing: (cardId: string) => void
  /** Hydrate a fully-formed processing state (e.g. from daemon reconciliation). */
  setProcessing: (state: ProcessingState) => void
  getProcessing: (cardId: string) => ProcessingState | undefined
}

export const useCardStore = create<CardState>()(
  persist(
    (set, get) => ({
      cards: [],
      columns: {},
      labels: {},
      processingCards: {},

      addCard: (data) => {
        // Dedup: reject if same title+column created in last 3 seconds
        const recent = get().cards.find((c) =>
          c.title === data.title && c.column_id === data.column_id &&
          Date.now() - new Date(c.created_at).getTime() < 3000
        )
        if (recent) return recent.id

        const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const card: Card = {
          ...data,
          id,
          labels: [],
          archived_at: null,
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

      archiveCard: (id) => {
        set((state) => ({
          cards: state.cards.map((c) =>
            c.id === id ? { ...c, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() } : c,
          ),
        }))
      },

      unarchiveCard: (id) => {
        set((state) => ({
          cards: state.cards.map((c) =>
            c.id === id ? { ...c, archived_at: null, updated_at: new Date().toISOString() } : c,
          ),
        }))
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
        // F10 — esconde archived por padrao (board nao polui). UI tem toggle pra mostrar.
        return get()
          .cards.filter((c) =>
            c.workspace_id === workspaceId
            && c.column_id === columnId
            && !c.archived_at,
          )
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

      startProcessing: (cardId, action, meta) => {
        set((state) => ({
          processingCards: {
            ...state.processingCards,
            [cardId]: {
              cardId,
              action,
              status: 'running',
              chunks: [],
              startedAt: new Date().toISOString(),
              ...meta,
            },
          },
        }))
      },

      addProcessingChunk: (cardId, text) => {
        set((state) => {
          const existing = state.processingCards[cardId]
          if (!existing) return state
          return {
            processingCards: {
              ...state.processingCards,
              [cardId]: { ...existing, chunks: [...existing.chunks, text] },
            },
          }
        })
      },

      errorProcessing: (cardId, error) => {
        set((state) => {
          const existing = state.processingCards[cardId]
          if (!existing) return state
          return {
            processingCards: {
              ...state.processingCards,
              [cardId]: { ...existing, status: 'error', error },
            },
          }
        })
        // Auto-clear error state after 8s so card returns to clean look
        setTimeout(() => {
          const cur = get().processingCards[cardId]
          if (cur && cur.status === 'error') {
            set((s) => {
              const { [cardId]: _, ...rest } = s.processingCards
              return { processingCards: rest }
            })
          }
        }, 8000)
      },

      completeProcessing: (cardId) => {
        set((state) => {
          const { [cardId]: _, ...rest } = state.processingCards
          return { processingCards: rest }
        })
      },

      setProcessing: (newState) => {
        set((state) => ({
          processingCards: { ...state.processingCards, [newState.cardId]: newState },
        }))
      },

      getProcessing: (cardId) => {
        return get().processingCards[cardId]
      },
    }),
    {
      name: 'cockpit-cards',
      version: 4,
      storage: createStorageAdapter(createDaemonStorageAdapter('cards')),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>
        // v1 → v2: add automation presets to existing columns
        if (state?.columns && typeof state.columns === 'object') {
          const presetMap: Record<string, typeof DEFAULT_COLUMNS[0]['automations']> = {}
          for (const dc of DEFAULT_COLUMNS) {
            presetMap[dc.slug] = dc.automations
          }

          const cols = state.columns as Record<string, Array<Record<string, unknown>>>
          for (const wsId of Object.keys(cols)) {
            cols[wsId] = cols[wsId].map((col) => {
              const slug = col.slug as string
              const existing = col.automations as unknown[] | undefined
              // Only backfill if empty or missing
              if (!existing || existing.length === 0) {
                return { ...col, automations: presetMap[slug] || [] }
              }
              return col
            })
          }
        }
        return state as unknown as CardState
      },
      partialize: (state) => {
        // Exclude processingCards from persistence (runtime-only)
        const { processingCards: _, ...rest } = state
        return rest as CardState
      },
    },
  ),
)
