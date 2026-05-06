// Resolve helpers — funcao pequena, regressao alta. Cada cenario novo
// (curto, longo, com #, prefix) corresponde a algo que o usuario escreve
// no terminal e espera "funcionar".

import { describe, test, expect } from 'bun:test'
import { shortId, resolveCard, resolveWorkspace } from '../api/resolve'
import type { Card, Workspace } from '../api/client'

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
  test('extrai ultimos 4 alfa-num em upper', () => {
    expect(shortId('card-1759934567890-sw78')).toBe('SW78')
  })

  test('descarta caracteres especiais', () => {
    expect(shortId('card-id-with-dashes-abcd')).toBe('ABCD')
  })

  test('id curto', () => {
    expect(shortId('xy')).toBe('XY')
  })
})

describe('resolveCard', () => {
  const cards = [
    mkCard('card-001-sw78', 'Login bug'),
    mkCard('card-002-aa90', 'Dark mode'),
    mkCard('card-003-bb11', 'Refactor'),
  ]

  test('match exato por id completo', () => {
    const c = resolveCard('card-001-sw78', cards)
    expect(c?.title).toBe('Login bug')
  })

  test('match por short id (uppercase)', () => {
    expect(resolveCard('SW78', cards)?.title).toBe('Login bug')
  })

  test('match por short id (lowercase)', () => {
    expect(resolveCard('sw78', cards)?.title).toBe('Login bug')
  })

  test('match por short id com #', () => {
    expect(resolveCard('#SW78', cards)?.title).toBe('Login bug')
  })

  test('match por prefix unico', () => {
    expect(resolveCard('card-002', cards)?.title).toBe('Dark mode')
  })

  test('prefix ambiguo retorna undefined', () => {
    expect(resolveCard('card', cards)).toBeUndefined()
  })

  test('ref vazia retorna undefined', () => {
    expect(resolveCard('', cards)).toBeUndefined()
  })

  test('nao encontrado', () => {
    expect(resolveCard('XXXX', cards)).toBeUndefined()
  })
})

describe('resolveWorkspace', () => {
  const workspaces: Workspace[] = [
    { id: 'ws-prime', name: 'Prime', slug: 'prime', description: null, color: '#00f', icon: null, created_at: '' },
    { id: 'ws-tixfy', name: 'Tixfy', slug: 'tixfy', description: null, color: '#0f0', icon: null, created_at: '' },
  ]

  test('match por slug', () => {
    expect(resolveWorkspace('prime', workspaces)?.id).toBe('ws-prime')
  })

  test('match por slug case-insensitive', () => {
    expect(resolveWorkspace('PRIME', workspaces)?.id).toBe('ws-prime')
  })

  test('match por nome', () => {
    expect(resolveWorkspace('Tixfy', workspaces)?.id).toBe('ws-tixfy')
  })

  test('match por id literal', () => {
    expect(resolveWorkspace('ws-prime', workspaces)?.id).toBe('ws-prime')
  })

  test('vazio retorna undefined', () => {
    expect(resolveWorkspace('', workspaces)).toBeUndefined()
  })

  test('inexistente retorna undefined', () => {
    expect(resolveWorkspace('zzz', workspaces)).toBeUndefined()
  })
})
