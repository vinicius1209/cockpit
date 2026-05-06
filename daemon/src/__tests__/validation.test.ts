import { describe, test, expect } from 'bun:test'
import {
  sanitizeSlug,
  validateProjectPath,
  sanitizeFilename,
  validateStoreName,
  sanitizeGhUser,
  validatePositiveNumber,
  validateSessionId,
} from '../validation'
import { homedir } from 'node:os'

const HOME = homedir()

// ── sanitizeSlug ──

describe('sanitizeSlug', () => {
  test('accepts valid slugs', () => {
    expect(sanitizeSlug('prime')).toBe('prime')
    expect(sanitizeSlug('card-123-abc')).toBe('card-123-abc')
    expect(sanitizeSlug('ws_test.v2')).toBe('ws_test.v2')
  })

  test('rejects path traversal', () => {
    expect(sanitizeSlug('../etc')).toBeNull()
    expect(sanitizeSlug('foo/../bar')).toBeNull()
  })

  test('rejects slashes', () => {
    expect(sanitizeSlug('foo/bar')).toBeNull()
    expect(sanitizeSlug('foo\\bar')).toBeNull()
  })

  test('rejects null bytes', () => {
    expect(sanitizeSlug('foo\0bar')).toBeNull()
  })

  test('rejects empty/falsy', () => {
    expect(sanitizeSlug('')).toBeNull()
    expect(sanitizeSlug(null as unknown as string)).toBeNull()
    expect(sanitizeSlug(undefined as unknown as string)).toBeNull()
  })

  test('rejects too long strings', () => {
    expect(sanitizeSlug('a'.repeat(201))).toBeNull()
    expect(sanitizeSlug('a'.repeat(200))).toBe('a'.repeat(200))
  })

  test('rejects special characters', () => {
    expect(sanitizeSlug('foo bar')).toBeNull()
    expect(sanitizeSlug('foo@bar')).toBeNull()
  })
})

// ── validateProjectPath ──

describe('validateProjectPath', () => {
  test('accepts valid paths under HOME', () => {
    const result = validateProjectPath(`${HOME}/projetos/prime`)
    expect(result).toBe(`${HOME}/projetos/prime`)
  })

  test('expands tilde', () => {
    const result = validateProjectPath('~/projetos/prime')
    expect(result).toBe(`${HOME}/projetos/prime`)
  })

  test('rejects paths outside HOME', () => {
    expect(validateProjectPath('/etc/passwd')).toBeNull()
    expect(validateProjectPath('/tmp/something')).toBeNull()
  })

  test('rejects HOME itself', () => {
    expect(validateProjectPath(HOME)).toBeNull()
    expect(validateProjectPath('~')).toBeNull()
  })

  test('rejects null bytes', () => {
    expect(validateProjectPath(`${HOME}/foo\0bar`)).toBeNull()
  })

  test('rejects empty/falsy', () => {
    expect(validateProjectPath('')).toBeNull()
    expect(validateProjectPath(null as unknown as string)).toBeNull()
  })

  test('resolves .. but still validates', () => {
    // ../../../etc would resolve outside HOME
    expect(validateProjectPath(`${HOME}/projetos/../../etc`)).toBeNull()
  })
})

// ── sanitizeFilename ──

describe('sanitizeFilename', () => {
  test('accepts valid filenames', () => {
    expect(sanitizeFilename('spec.md')).toBe('spec.md')
    expect(sanitizeFilename('meta.json')).toBe('meta.json')
    expect(sanitizeFilename('session-001.json')).toBe('session-001.json')
    expect(sanitizeFilename('interview.jsonl')).toBe('interview.jsonl')
  })

  test('rejects path traversal', () => {
    expect(sanitizeFilename('../etc/passwd')).toBeNull()
    expect(sanitizeFilename('../../secrets.json')).toBeNull()
  })

  test('rejects slashes', () => {
    expect(sanitizeFilename('foo/bar.md')).toBeNull()
  })

  test('rejects empty', () => {
    expect(sanitizeFilename('')).toBeNull()
  })

  test('rejects too long', () => {
    expect(sanitizeFilename('a'.repeat(101))).toBeNull()
  })
})

// ── validateStoreName ──

describe('validateStoreName', () => {
  test('accepts whitelisted stores', () => {
    expect(validateStoreName('cards')).toBe('cards')
    expect(validateStoreName('workspaces')).toBe('workspaces')
    expect(validateStoreName('agents')).toBe('agents')
    expect(validateStoreName('docs')).toBe('docs')
    expect(validateStoreName('projects')).toBe('projects')
  })

  test('rejects unknown stores', () => {
    expect(validateStoreName('passwords')).toBeNull()
    expect(validateStoreName('secrets')).toBeNull()
    expect(validateStoreName('admin')).toBeNull()
    expect(validateStoreName('')).toBeNull()
  })
})

// ── sanitizeGhUser ──

describe('sanitizeGhUser', () => {
  test('accepts valid usernames', () => {
    expect(sanitizeGhUser('viniimachadoprime')).toBe('viniimachadoprime')
    expect(sanitizeGhUser('user-123')).toBe('user-123')
  })

  test('rejects special characters', () => {
    expect(sanitizeGhUser('user;rm -rf /')).toBeNull()
    expect(sanitizeGhUser('user name')).toBeNull()
    expect(sanitizeGhUser('user@domain')).toBeNull()
  })

  test('rejects too long (>39 chars)', () => {
    expect(sanitizeGhUser('a'.repeat(40))).toBeNull()
    expect(sanitizeGhUser('a'.repeat(39))).toBe('a'.repeat(39))
  })

  test('rejects empty', () => {
    expect(sanitizeGhUser('')).toBeNull()
  })
})

// ── validatePositiveNumber ──

describe('validatePositiveNumber', () => {
  test('accepts valid numbers in range', () => {
    expect(validatePositiveNumber(5)).toBe(5)
    expect(validatePositiveNumber(0.5, 0.1, 10)).toBe(0.5)
    expect(validatePositiveNumber('3.14')).toBe(3.14)
  })

  test('rejects NaN', () => {
    expect(validatePositiveNumber('abc')).toBeNull()
    expect(validatePositiveNumber(NaN)).toBeNull()
  })

  test('rejects below min', () => {
    expect(validatePositiveNumber(0)).toBeNull()
    expect(validatePositiveNumber(-5)).toBeNull()
  })

  test('rejects above max', () => {
    expect(validatePositiveNumber(20000)).toBeNull()
    expect(validatePositiveNumber(200, 0.1, 100)).toBeNull()
  })
})

// ── validateSessionId (C2 fix — path traversal protection) ──

describe('validateSessionId', () => {
  test('aceita ids gerados normalmente', () => {
    expect(validateSessionId('session-1759934567890-sw78')).toBe('session-1759934567890-sw78')
    expect(validateSessionId('sess-abc123')).toBe('sess-abc123')
    expect(validateSessionId('SESSION-UPPER-OK')).toBe('SESSION-UPPER-OK')
  })

  test('REJEITA path traversal', () => {
    expect(validateSessionId('../etc/passwd')).toBeNull()
    expect(validateSessionId('..')).toBeNull()
    expect(validateSessionId('foo/bar')).toBeNull()
    expect(validateSessionId('foo\\bar')).toBeNull()
  })

  test('REJEITA caracteres especiais', () => {
    expect(validateSessionId('foo bar')).toBeNull()  // espaco
    expect(validateSessionId('foo.bar')).toBeNull()  // ponto
    expect(validateSessionId('foo\0bar')).toBeNull()  // null byte
    expect(validateSessionId('foo;rm -rf /')).toBeNull()  // shell injection attempt
  })

  test('rejeita vazio e tipos errados', () => {
    expect(validateSessionId('')).toBeNull()
    expect(validateSessionId(null as unknown as string)).toBeNull()
    expect(validateSessionId(undefined as unknown as string)).toBeNull()
  })

  test('rejeita strings excessivamente longas', () => {
    expect(validateSessionId('a'.repeat(129))).toBeNull()
    expect(validateSessionId('a'.repeat(128))).toBe('a'.repeat(128))  // exato 128 ok
  })
})
