// Tests pra helpers de api.ts (mcp). Equivalente aos do CLI mas com tipos
// proprios — duplicacao consciente porque cada package tem sua versao.

import { describe, test, expect } from 'bun:test'
import { shortId, resolveCard, resolveWorkspace, newCardId, ProjectLockedError } from '../api'
import type { Card, Workspace } from '../api'

const baseCard = {
  workspace_id: 'ws-1',
  column_id: 'col-1',
  project_id: null,
  description: null,
  type: 'feature',
  priority: 'medium',
  position: 0,
  assignee: null,
  due_date: null,
  spec_status: null,
  spec_content: null,
  interview_notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  archived_at: null,
  pr_url: null,
} as const

const mkCard = (id: string, title = 't'): Card => ({ ...baseCard, id, title })

describe('shortId', () => {
  test('extrai 4 chars finais alfa-num em upper', () => {
    expect(shortId('card-1759934567890-sw78')).toBe('SW78')
  })

  test('id curto', () => {
    expect(shortId('xy')).toBe('XY')
  })

  test('descarta caracteres especiais', () => {
    expect(shortId('a-b-c-d-e-f-g-h')).toBe('EFGH')
  })
})

describe('resolveCard', () => {
  const cards = [
    mkCard('card-001-sw78', 'Login bug'),
    mkCard('card-002-aa90', 'Dark mode'),
  ]

  test('match por id completo', () => {
    expect(resolveCard('card-001-sw78', cards)?.title).toBe('Login bug')
  })

  test('match por short upper', () => {
    expect(resolveCard('SW78', cards)?.title).toBe('Login bug')
  })

  test('match por short lower', () => {
    expect(resolveCard('sw78', cards)?.title).toBe('Login bug')
  })

  test('match com #', () => {
    expect(resolveCard('#sw78', cards)?.title).toBe('Login bug')
  })

  test('match por prefix unico', () => {
    expect(resolveCard('card-002', cards)?.title).toBe('Dark mode')
  })

  test('prefix ambiguo retorna undefined', () => {
    expect(resolveCard('card', cards)).toBeUndefined()
  })

  test('vazio retorna undefined', () => {
    expect(resolveCard('', cards)).toBeUndefined()
  })
})

describe('resolveWorkspace', () => {
  const workspaces: Workspace[] = [
    { id: 'ws-prime', name: 'Prime', slug: 'prime', description: null, color: '#00f', icon: null },
    { id: 'ws-tixfy', name: 'Tixfy', slug: 'tixfy', description: null, color: '#0f0', icon: null },
  ]

  test('por slug', () => {
    expect(resolveWorkspace('prime', workspaces)?.id).toBe('ws-prime')
  })

  test('por nome (case-insensitive)', () => {
    expect(resolveWorkspace('TIXFY', workspaces)?.id).toBe('ws-tixfy')
  })

  test('por id literal', () => {
    expect(resolveWorkspace('ws-prime', workspaces)?.id).toBe('ws-prime')
  })

  test('inexistente', () => {
    expect(resolveWorkspace('xxx', workspaces)).toBeUndefined()
  })
})

describe('newCardId', () => {
  test('gera id unico no formato card-<ts>-<rand>', () => {
    const a = newCardId()
    const b = newCardId()
    expect(a).toMatch(/^card-\d+-[a-z0-9]+$/)
    expect(a).not.toBe(b)
  })
})

describe('ProjectLockedError', () => {
  test('expoe path + heldBy + hints', () => {
    const heldBy = {
      session_id: 'sess-1',
      acquired_at: '2026-01-01T00:00:00Z',
      age_seconds: 30,
      card_id: 'card-1',
    }
    const err = new ProjectLockedError('/tmp/foo', heldBy, ['aguarde', 'aborte'])
    expect(err.name).toBe('ProjectLockedError')
    expect(err.projectPath).toBe('/tmp/foo')
    expect(err.heldBy.session_id).toBe('sess-1')
    expect(err.heldBy.card_id).toBe('card-1')
    expect(err.hints).toEqual(['aguarde', 'aborte'])
  })

  test('e instance de Error', () => {
    const err = new ProjectLockedError('/tmp', {
      session_id: 'x', acquired_at: '',
    })
    expect(err instanceof Error).toBe(true)
    expect(err instanceof ProjectLockedError).toBe(true)
  })

  test('hints default vazio', () => {
    const err = new ProjectLockedError('/tmp', { session_id: 'x', acquired_at: '' })
    expect(err.hints).toEqual([])
  })
})
