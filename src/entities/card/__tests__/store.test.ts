import { describe, test, expect, beforeEach } from 'vitest'
import { useCardStore } from '../store'

// Reset store state before each test
beforeEach(() => {
  useCardStore.setState({
    cards: [],
    columns: {},
    labels: {},
    processingCards: {},
  })
})

const makeCard = (overrides = {}) => ({
  workspace_id: 'ws-test',
  column_id: 'col-inbox',
  project_id: null,
  title: 'Test Card',
  description: null,
  type: 'feature' as const,
  priority: 'medium' as const,
  position: 0,
  assignee: null,
  due_date: null,
  spec_status: null,
  spec_content: null,
  interview_notes: null,
  interview_messages: null,
  task_workspace_path: null,
  ...overrides,
})

describe('useCardStore', () => {
  test('addCard creates card with id', () => {
    const id = useCardStore.getState().addCard(makeCard())
    expect(id).toMatch(/^card-/)

    const cards = useCardStore.getState().cards
    expect(cards.length).toBe(1)
    expect(cards[0].title).toBe('Test Card')
    expect(cards[0].id).toBe(id)
  })

  test('addCard dedup: same title+column in 3s returns same id', () => {
    const id1 = useCardStore.getState().addCard(makeCard())
    const id2 = useCardStore.getState().addCard(makeCard())
    expect(id1).toBe(id2)
    expect(useCardStore.getState().cards.length).toBe(1)
  })

  test('addCard allows same title in different columns', () => {
    const id1 = useCardStore.getState().addCard(makeCard({ column_id: 'col-a' }))
    const id2 = useCardStore.getState().addCard(makeCard({ column_id: 'col-b' }))
    expect(id1).not.toBe(id2)
    expect(useCardStore.getState().cards.length).toBe(2)
  })

  test('updateCard modifies fields', () => {
    const id = useCardStore.getState().addCard(makeCard())
    useCardStore.getState().updateCard(id, { title: 'Updated', priority: 'high' })

    const card = useCardStore.getState().cards[0]
    expect(card.title).toBe('Updated')
    expect(card.priority).toBe('high')
  })

  test('deleteCard removes', () => {
    const id = useCardStore.getState().addCard(makeCard())
    expect(useCardStore.getState().cards.length).toBe(1)

    useCardStore.getState().deleteCard(id)
    expect(useCardStore.getState().cards.length).toBe(0)
  })

  test('moveCard updates column_id and position', () => {
    const id = useCardStore.getState().addCard(makeCard())
    useCardStore.getState().moveCard(id, 'col-review', 3)

    const card = useCardStore.getState().cards[0]
    expect(card.column_id).toBe('col-review')
    expect(card.position).toBe(3)
  })

  test('getColumnCards filters and sorts by position', () => {
    useCardStore.getState().addCard(makeCard({ title: 'B', position: 1 }))
    useCardStore.getState().addCard(makeCard({ title: 'A', position: 0 }))

    // Need different titles to avoid dedup
    useCardStore.setState((s) => ({
      cards: s.cards.map((c, i) => ({ ...c, title: `Card ${i}`, position: i })),
    }))

    const cards = useCardStore.getState().getColumnCards('ws-test', 'col-inbox')
    expect(cards[0].position).toBe(0)
    expect(cards[1].position).toBe(1)
  })

  test('initWorkspaceColumns creates default columns', () => {
    useCardStore.getState().initWorkspaceColumns('ws-new')
    const cols = useCardStore.getState().columns['ws-new']
    expect(cols).toBeDefined()
    expect(cols.length).toBe(7) // Inbox, Discovery, Spec, Ready, In Progress, Review, Done
    expect(cols[0].slug).toBe('inbox')
    expect(cols[6].slug).toBe('done')
  })

  test('toggleCardLabel add and remove', () => {
    const cardId = useCardStore.getState().addCard(makeCard())
    const label = { id: 'lbl-1', workspace_id: 'ws-test', name: 'Bug', color: '#f00' }

    // Add
    useCardStore.getState().toggleCardLabel(cardId, label)
    expect(useCardStore.getState().cards[0].labels.length).toBe(1)

    // Remove (toggle)
    useCardStore.getState().toggleCardLabel(cardId, label)
    expect(useCardStore.getState().cards[0].labels.length).toBe(0)
  })

  test('processing lifecycle: start → addChunk → complete', () => {
    const cardId = 'card-proc'

    useCardStore.getState().startProcessing(cardId, 'discovery')
    const p1 = useCardStore.getState().getProcessing(cardId)
    expect(p1).toBeDefined()
    expect(p1!.action).toBe('discovery')
    expect(p1!.status).toBe('running')

    useCardStore.getState().addProcessingChunk(cardId, 'chunk 1')
    const p2 = useCardStore.getState().getProcessing(cardId)
    expect(p2!.chunks.length).toBe(1)

    useCardStore.getState().completeProcessing(cardId)
    expect(useCardStore.getState().getProcessing(cardId)).toBeUndefined()
  })
})
