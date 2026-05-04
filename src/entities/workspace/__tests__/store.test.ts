import { describe, test, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../store'

beforeEach(() => {
  // Reset to seed workspaces
  useWorkspaceStore.setState({
    workspaces: [
      { id: 'ws-test', name: 'Test', slug: 'test', description: null, color: '#3b82f6', icon: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
    activeWorkspaceId: 'ws-test',
  })
})

describe('useWorkspaceStore', () => {
  test('addWorkspace creates workspace', () => {
    useWorkspaceStore.getState().addWorkspace({
      name: 'New WS', slug: 'new-ws', description: null, color: '#f00', icon: null,
    })

    const ws = useWorkspaceStore.getState().workspaces
    expect(ws.length).toBe(2)
    expect(ws[1].slug).toBe('new-ws')
  })

  test('addWorkspace dedup by slug', () => {
    useWorkspaceStore.getState().addWorkspace({
      name: 'Test Dup', slug: 'test', description: null, color: '#f00', icon: null,
    })

    // Should not create duplicate
    expect(useWorkspaceStore.getState().workspaces.length).toBe(1)
  })

  test('updateWorkspace modifies fields', () => {
    useWorkspaceStore.getState().updateWorkspace('ws-test', { name: 'Updated' })
    expect(useWorkspaceStore.getState().workspaces[0].name).toBe('Updated')
  })

  test('deleteWorkspace removes and updates activeId', () => {
    // Add second workspace first
    useWorkspaceStore.getState().addWorkspace({
      name: 'Second', slug: 'second', description: null, color: '#0f0', icon: null,
    })

    useWorkspaceStore.getState().deleteWorkspace('ws-test')
    const ws = useWorkspaceStore.getState().workspaces
    expect(ws.length).toBe(1)
    expect(ws[0].slug).toBe('second')
    // activeWorkspaceId should switch to remaining
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(ws[0].id)
  })

  test('setActiveWorkspace + getActiveWorkspace roundtrip', () => {
    useWorkspaceStore.getState().addWorkspace({
      name: 'Other', slug: 'other', description: null, color: '#0f0', icon: null,
    })

    const ws = useWorkspaceStore.getState().workspaces
    const otherId = ws.find((w) => w.slug === 'other')!.id

    useWorkspaceStore.getState().setActiveWorkspace(otherId)
    const active = useWorkspaceStore.getState().getActiveWorkspace()
    expect(active).toBeDefined()
    expect(active!.slug).toBe('other')
  })

  test('getActiveWorkspace returns undefined for invalid id', () => {
    useWorkspaceStore.getState().setActiveWorkspace('ws-nonexistent')
    const active = useWorkspaceStore.getState().getActiveWorkspace()
    expect(active).toBeUndefined()
  })
})
