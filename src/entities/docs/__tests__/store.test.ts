import { describe, test, expect, beforeEach } from 'vitest'
import { useDocStore } from '../store'

beforeEach(() => {
  useDocStore.setState({ docs: [] })
})

const makeDoc = (overrides = {}) => ({
  workspace_id: 'ws-test',
  project_id: null,
  title: 'Test Doc',
  content: '# Content',
  tags: ['spec'],
  source: 'agent-generated' as const,
  source_ref: null,
  card_id: 'card-1',
  ...overrides,
})

describe('useDocStore', () => {
  test('addDoc creates doc with id', () => {
    const id = useDocStore.getState().addDoc(makeDoc())
    expect(id).toMatch(/^doc-/)
    expect(useDocStore.getState().docs.length).toBe(1)
  })

  test('addDoc dedup: same card_id+title updates instead of creating', () => {
    const id1 = useDocStore.getState().addDoc(makeDoc({ content: 'v1' }))
    const id2 = useDocStore.getState().addDoc(makeDoc({ content: 'v2' }))

    expect(id1).toBe(id2)
    expect(useDocStore.getState().docs.length).toBe(1)
    expect(useDocStore.getState().docs[0].content).toBe('v2')
  })

  test('addDoc allows different titles for same card', () => {
    useDocStore.getState().addDoc(makeDoc({ title: 'Spec: Test' }))
    useDocStore.getState().addDoc(makeDoc({ title: 'Interview: Test' }))

    expect(useDocStore.getState().docs.length).toBe(2)
  })

  test('addDoc without card_id always creates new', () => {
    useDocStore.getState().addDoc(makeDoc({ card_id: null, title: 'Manual' }))
    useDocStore.getState().addDoc(makeDoc({ card_id: null, title: 'Manual' }))

    expect(useDocStore.getState().docs.length).toBe(2)
  })

  test('getWorkspaceDocs filters and sorts by updated_at desc', () => {
    useDocStore.getState().addDoc(makeDoc({ title: 'Old', card_id: 'c1' }))
    useDocStore.getState().addDoc(makeDoc({ title: 'New', card_id: 'c2' }))

    const docs = useDocStore.getState().getWorkspaceDocs('ws-test')
    expect(docs.length).toBe(2)
    // Most recently updated first
    expect(docs[0].updated_at >= docs[1].updated_at).toBe(true)
  })

  test('getCardDocs filters by card_id', () => {
    useDocStore.getState().addDoc(makeDoc({ card_id: 'card-a', title: 'A' }))
    useDocStore.getState().addDoc(makeDoc({ card_id: 'card-b', title: 'B' }))

    const docs = useDocStore.getState().getCardDocs('card-a')
    expect(docs.length).toBe(1)
    expect(docs[0].title).toBe('A')
  })

  test('searchDocs searches by title/content/tags', () => {
    useDocStore.getState().addDoc(makeDoc({ title: 'Spec: Login', content: 'Auth flow', tags: ['feature'], card_id: 'c1' }))
    useDocStore.getState().addDoc(makeDoc({ title: 'Spec: Print', content: 'PDF layout', tags: ['bugfix'], card_id: 'c2' }))

    expect(useDocStore.getState().searchDocs('ws-test', 'login').length).toBe(1)
    expect(useDocStore.getState().searchDocs('ws-test', 'PDF').length).toBe(1)
    expect(useDocStore.getState().searchDocs('ws-test', 'bugfix').length).toBe(1)
    expect(useDocStore.getState().searchDocs('ws-test', 'nonexistent').length).toBe(0)
  })

  test('deleteDoc removes', () => {
    const id = useDocStore.getState().addDoc(makeDoc())
    useDocStore.getState().deleteDoc(id)
    expect(useDocStore.getState().docs.length).toBe(0)
  })
})
