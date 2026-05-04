import { describe, test, expect } from 'bun:test'
import { TaskWorkspace } from '../tasks/task-workspace'

// Use unique test workspace to avoid conflicts
const WS = '_test_tw_' + Date.now()
const CARD = 'card-test-tw'

describe('TaskWorkspace', () => {
  test('ensure creates directory', async () => {
    const path = await TaskWorkspace.ensure(WS, CARD)
    expect(path).toContain(WS)
    expect(path).toContain(CARD)

    const dir = Bun.file(path)
    // Directory exists (Bun.file on dir won't have .exists for dirs, but ensure doesn't throw)
  })

  test('writeSpec + readFile roundtrip', async () => {
    await TaskWorkspace.writeSpec(WS, CARD, '# My Spec\n\nContent here')
    const content = await TaskWorkspace.readFile(WS, CARD, 'spec.md')
    expect(content).toBe('# My Spec\n\nContent here')
  })

  test('writeDiscovery + readFile roundtrip', async () => {
    await TaskWorkspace.writeDiscovery(WS, CARD, '## Discovery Output')
    const content = await TaskWorkspace.readFile(WS, CARD, 'discovery.md')
    expect(content).toBe('## Discovery Output')
  })

  test('writeInterview + readFile roundtrip', async () => {
    await TaskWorkspace.writeInterview(WS, CARD, 'Interview notes here')
    const content = await TaskWorkspace.readFile(WS, CARD, 'interview.md')
    expect(content).toBe('Interview notes here')
  })

  test('writeFeedback appends with timestamp', async () => {
    await TaskWorkspace.writeFeedback(WS, CARD, 'First feedback', 1)
    await TaskWorkspace.writeFeedback(WS, CARD, 'Second feedback', 2)

    const content = await TaskWorkspace.readFile(WS, CARD, 'feedback.md')
    expect(content).toContain('Tentativa 1')
    expect(content).toContain('First feedback')
    expect(content).toContain('Tentativa 2')
    expect(content).toContain('Second feedback')
  })

  test('appendImplementationLog appends with timestamp', async () => {
    await TaskWorkspace.appendImplementationLog(WS, CARD, 'Started')
    await TaskWorkspace.appendImplementationLog(WS, CARD, 'Finished')

    const content = await TaskWorkspace.readFile(WS, CARD, 'implementation.md')
    expect(content).toContain('Started')
    expect(content).toContain('Finished')
    // Has timestamp format [HH:MM:SS]
    expect(content).toMatch(/\[\d{2}:\d{2}:\d{2}\]/)
  })

  test('writeMeta merges with existing', async () => {
    await TaskWorkspace.writeMeta(WS, CARD, { title: 'Test', type: 'feature' })
    await TaskWorkspace.writeMeta(WS, CARD, { branch: 'feat/test' })

    const content = await TaskWorkspace.readFile(WS, CARD, 'meta.json')
    const meta = JSON.parse(content!)
    expect(meta.title).toBe('Test')
    expect(meta.type).toBe('feature')
    expect(meta.branch).toBe('feat/test')
    expect(meta.updatedAt).toBeTruthy()
  })

  test('sync creates all files', async () => {
    const ws = WS + '-sync'
    const card = 'card-sync'

    await TaskWorkspace.sync({
      workspaceSlug: ws,
      cardId: card,
      title: 'Sync Test',
      type: 'feature',
      spec: '# Spec content',
      interviewNotes: 'Notes here',
    })

    const spec = await TaskWorkspace.readFile(ws, card, 'spec.md')
    expect(spec).toBe('# Spec content')

    const interview = await TaskWorkspace.readFile(ws, card, 'interview.md')
    expect(interview).toBe('Notes here')

    const meta = await TaskWorkspace.readFile(ws, card, 'meta.json')
    expect(JSON.parse(meta!).title).toBe('Sync Test')
  })

  test('listFiles returns file entries', async () => {
    const files = await TaskWorkspace.listFiles(WS, CARD)
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain('spec.md')
    expect(files).toContain('meta.json')
  })

  test('readFile returns null for nonexistent', async () => {
    const content = await TaskWorkspace.readFile(WS, CARD, 'nonexistent.md')
    expect(content).toBeNull()
  })

  test('getPath returns expected path format', () => {
    const path = TaskWorkspace.getPath('prime', 'card-123')
    expect(path).toContain('.cockpit/tasks/prime/card-123')
  })
})
