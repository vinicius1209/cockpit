// Layout helpers — clip/padRight/padLeft/center/joinCols.
// Caso critico: respeitar largura visivel ignorando ANSI escapes.

import { describe, test, expect } from 'bun:test'
import { clip, padRight, padLeft, center, joinCols, box } from '../tui/layout'

describe('clip', () => {
  test('string menor que width retorna intacta', () => {
    expect(clip('abc', 10)).toBe('abc')
  })

  test('string igual a width retorna intacta', () => {
    expect(clip('abc', 3)).toBe('abc')
  })

  test('string maior trunca com sufixo …', () => {
    const out = clip('abcdefghij', 5)
    expect(out).toContain('…')
    expect(out.length).toBeLessThanOrEqual(10)  // includes ANSI reset
  })

  test('string com ANSI mantem cor + clip pelo visivel', () => {
    const colored = '\x1b[31mhello world\x1b[0m'
    const out = clip(colored, 5)
    expect(out).toContain('\x1b[31m')  // preserva ANSI open
    expect(out).toContain('…')
  })

  test('sufixo customizavel', () => {
    const out = clip('abcdefghij', 5, '...')
    expect(out).toContain('...')
  })
})

describe('padRight', () => {
  test('preenche ate width', () => {
    expect(padRight('abc', 6)).toBe('abc   ')
  })

  test('nao expande quando ja maior — clipa', () => {
    expect(padRight('abcdef', 3).length).toBeLessThan(10)
  })

  test('respeita ANSI invisivel', () => {
    const out = padRight('\x1b[31mabc\x1b[0m', 6)
    // string colorida tem 3 chars visiveis, deve adicionar 3 espacos
    expect(out).toMatch(/abc\x1b\[0m\s{3}|\x1b\[0m\s{3}$/)
  })

  test('char custom de padding', () => {
    expect(padRight('abc', 6, '.')).toBe('abc...')
  })
})

describe('padLeft', () => {
  test('preenche ate width pela esquerda', () => {
    expect(padLeft('abc', 6)).toBe('   abc')
  })

  test('char custom', () => {
    expect(padLeft('5', 3, '0')).toBe('005')
  })
})

describe('center', () => {
  test('centraliza em width par', () => {
    expect(center('abc', 7)).toBe('  abc  ')
  })

  test('centraliza com sobra desigual', () => {
    // 6 chars de width pra 'abc' → 1 left, 2 right (right ganha sobra)
    expect(center('abc', 6)).toBe(' abc  ')
  })

  test('string igual a width', () => {
    expect(center('abc', 3)).toBe('abc')
  })
})

describe('joinCols', () => {
  test('junta colunas linha por linha', () => {
    const out = joinCols([
      { content: ['a', 'b'], width: 3 },
      { content: ['x', 'y'], width: 3 },
    ])
    expect(out).toEqual(['a   x  ', 'b   y  '])
  })

  test('alturas diferentes — col mais curta vira string vazia', () => {
    const out = joinCols([
      { content: ['a', 'b', 'c'], width: 2 },
      { content: ['x'], width: 2 },
    ])
    // 3 linhas. Primeira col tem 'a/b/c', segunda 'x' depois vazio
    expect(out).toHaveLength(3)
    expect(out[0]).toContain('a')
    expect(out[0]).toContain('x')
    expect(out[1]).toContain('b')
  })

  test('gap configuravel', () => {
    const out = joinCols(
      [
        { content: ['a'], width: 2 },
        { content: ['x'], width: 2 },
      ],
      3,
    )
    // 'a' padded a width=2 ('a '), gap=3 spaces, 'x' padded a width=2 ('x ')
    expect(out[0]).toBe('a ' + '   ' + 'x ')
  })
})

describe('box', () => {
  test('caixa simples', () => {
    const out = box(['hello'], { width: 10 })
    expect(out).toHaveLength(3)  // top + body + bottom
    expect(out[0]).toContain('╭')
    expect(out[0]).toContain('╮')
    expect(out[2]).toContain('╰')
    expect(out[2]).toContain('╯')
    expect(out[1]).toContain('hello')
  })

  test('caixa com titulo', () => {
    const out = box(['x'], { width: 20, title: 'TITULO' })
    expect(out[0]).toContain('TITULO')
  })

  test('multiplas linhas no body', () => {
    const out = box(['line1', 'line2', 'line3'], { width: 10 })
    expect(out).toHaveLength(5)  // top + 3 body + bottom
  })
})
