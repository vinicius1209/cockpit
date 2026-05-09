import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { useCardStore } from '@/entities/card/store'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { BoardColumn } from './board-column'
import { BoardCard } from './board-card'
import { CardDialog } from './card-dialog'
import { BoardFiltersBar, type BoardFilters } from './board-filters'
import type { Card } from '@/entities/card/types'
import { toast } from 'sonner'

export function BoardView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  // Subscribe only to data arrays — re-render when cards/columns/labels change
  const cards = useCardStore((s) => s.cards)
  // Subscribe to columns/labels arrays to trigger re-render when they change.
  // The values themselves are read via useCardStore.getState() below.
  useCardStore((s) => s.columns)
  useCardStore((s) => s.labels)

  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [defaultColumnId, setDefaultColumnId] = useState<string | undefined>()
  const [filters, setFilters] = useState<BoardFilters>({ types: [], priorities: [], labelIds: [], includeArchived: false })
  const lastDragRef = useRef<{ cardId: string; ts: number } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  if (!activeWorkspaceId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecione um workspace na sidebar
      </div>
    )
  }

  const { getWorkspaceColumns, getColumnCards, moveCard, getWorkspaceLabels } = useCardStore.getState()
  const columns = getWorkspaceColumns(activeWorkspaceId)

  const hasFilters = filters.types.length > 0 || filters.priorities.length > 0 || filters.labelIds.length > 0
  const workspaceLabels = getWorkspaceLabels(activeWorkspaceId)

  const workspaceCards = useMemo(
    () => cards.filter((c) => c.workspace_id === activeWorkspaceId),
    [cards, activeWorkspaceId],
  )

  const archivedCount = useMemo(
    () => workspaceCards.filter((c) => !!c.archived_at).length,
    [workspaceCards],
  )

  const filterCards = useCallback(
    (columnCards: Card[]) => {
      if (!hasFilters) return columnCards
      return columnCards.filter((c) => {
        if (filters.types.length > 0 && !filters.types.includes(c.type)) return false
        if (filters.priorities.length > 0 && !filters.priorities.includes(c.priority)) return false
        if (filters.labelIds.length > 0 && !c.labels.some((cl) => filters.labelIds.includes(cl.label_id))) return false
        return true
      })
    },
    [filters, hasFilters],
  )

  /** Cards de uma coluna respeitando includeArchived. getColumnCards exclui archived
   *  por padrão; aqui adicionamos de volta quando o toggle esta on. */
  const columnCardsFor = useCallback(
    (columnId: string): Card[] => {
      const active = getColumnCards(activeWorkspaceId, columnId)
      if (!filters.includeArchived) return active
      const archived = workspaceCards
        .filter((c) => c.column_id === columnId && !!c.archived_at)
        .sort((a, b) => a.position - b.position)
      return [...active, ...archived]
    },
    [activeWorkspaceId, getColumnCards, workspaceCards, filters.includeArchived],
  )

  const filteredTotal = useMemo(() => {
    if (!hasFilters) return workspaceCards.length
    return filterCards(workspaceCards).length
  }, [workspaceCards, filterCards, hasFilters])

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const card = active.data.current?.card as Card | undefined
    if (card) setActiveCard(card)
  }

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback is handled by the droppable
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCard(null)

    if (!over) return

    const activeCard = active.data.current?.card as Card | undefined
    if (!activeCard) return

    // Dedup: prevent double-fire within 500ms for same card
    const now = Date.now()
    if (lastDragRef.current && lastDragRef.current.cardId === activeCard.id && now - lastDragRef.current.ts < 500) return
    lastDragRef.current = { cardId: activeCard.id, ts: now }

    const overColumn = over.data.current?.column
    const overCard = over.data.current?.card as Card | undefined

    let targetColumnId: string
    let targetPosition: number

    if (overColumn) {
      targetColumnId = overColumn.id
      const cardsInColumn = getColumnCards(activeWorkspaceId, targetColumnId)
      targetPosition = cardsInColumn.length
    } else if (overCard) {
      targetColumnId = overCard.column_id
      targetPosition = overCard.position
    } else {
      return
    }

    if (activeCard.column_id !== targetColumnId || activeCard.position !== targetPosition) {
      moveCard(activeCard.id, targetColumnId, targetPosition)

      // Trigger column automations
      const targetCol = columns.find((c) => c.id === targetColumnId)
      if (targetCol && activeCard.column_id !== targetColumnId) {
        import('@/entities/card/automation-engine').then(({ executeColumnAutomations }) => {
          executeColumnAutomations(activeCard, targetCol, activeWorkspaceId)
        }).catch((err) => {
          console.error('[automation] Failed:', err)
          toast.error('Automacao falhou', { description: err instanceof Error ? err.message : 'Erro desconhecido' })
        })
      }
    }
  }

  const handleCardClick = useCallback((card: Card) => {
    setSelectedCard(card)
    setDefaultColumnId(undefined)
    setDialogOpen(true)
  }, [])

  const handleAddCard = useCallback((columnId: string) => {
    setSelectedCard(null)
    setDefaultColumnId(columnId)
    setDialogOpen(true)
  }, [])

  // Command Palette / Live Agents podem navegar com ?cardId=... ?new=1 ?archived=1
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const cardIdParam = searchParams.get('cardId')
    const newParam = searchParams.get('new')
    const archivedParam = searchParams.get('archived')
    if (cardIdParam) {
      const card = cards.find((c) => c.id === cardIdParam)
      if (card) {
        setSelectedCard(card)
        setDefaultColumnId(undefined)
        setDialogOpen(true)
      }
      // Limpa param pra esc poder fechar sem reabrir
      const next = new URLSearchParams(searchParams)
      next.delete('cardId')
      setSearchParams(next, { replace: true })
    } else if (newParam === '1') {
      setSelectedCard(null)
      setDefaultColumnId(undefined)
      setDialogOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    } else if (archivedParam === '1') {
      setFilters((prev) => ({ ...prev, includeArchived: true }))
      const next = new URLSearchParams(searchParams)
      next.delete('archived')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams, cards])

  return (
    <div className="flex h-full flex-col">
      <BoardFiltersBar
        filters={filters}
        onChange={setFilters}
        totalCards={workspaceCards.length}
        filteredCards={filteredTotal}
        labels={workspaceLabels}
        archivedCount={archivedCount}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {columns.length > 1 && (
          <div className="sm:hidden px-3 pt-1 pb-1 text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1">
            <span>swipe</span>
            <span aria-hidden>← →</span>
            <span className="ml-auto tabular-nums">{columns.length} colunas</span>
          </div>
        )}
        <div className="flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory sm:snap-none">
          <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 h-full">
            {columns.map((column, idx) => {
              const columnCards = filterCards(columnCardsFor(column.id))
              return (
                <BoardColumn
                  key={column.id}
                  column={column}
                  cards={columnCards}
                  onCardClick={handleCardClick}
                  onAddCard={handleAddCard}
                  index={idx}
                  totalColumns={columns.length}
                />
              )
            })}
          </div>
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="w-72 opacity-90">
              <BoardCard card={activeCard} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <CardDialog
        card={selectedCard}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        defaultColumnId={defaultColumnId}
        workspaceId={activeWorkspaceId}
      />
    </div>
  )
}
