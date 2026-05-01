import { useState, useCallback } from 'react'
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
import type { Card } from '@/entities/card/types'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

export function BoardView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { getWorkspaceColumns, getColumnCards, moveCard } = useCardStore()

  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [defaultColumnId, setDefaultColumnId] = useState<string | undefined>()

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

  const columns = getWorkspaceColumns(activeWorkspaceId)

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

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <ScrollArea className="h-full">
          <div className="flex gap-4 p-4 h-full">
            {columns.map((column) => {
              const cards = getColumnCards(activeWorkspaceId, column.id)
              return (
                <BoardColumn
                  key={column.id}
                  column={column}
                  cards={cards}
                  onCardClick={handleCardClick}
                  onAddCard={handleAddCard}
                />
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

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
    </>
  )
}
