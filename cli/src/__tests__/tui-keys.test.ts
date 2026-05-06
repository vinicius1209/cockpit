// Regressao: parser de stdin raw. Cobertura nas escape sequences que o
// engine de TUI consome — qualquer mudanca silenciosa quebra navegacao.

import { describe, test, expect } from 'bun:test'
import { parseKey } from '../tui/keys'

describe('parseKey — caracteres simples', () => {
  test('letra minuscula', () => {
    const keys = parseKey('a')
    expect(keys).toHaveLength(1)
    expect(keys[0]).toEqual({ name: 'a', sequence: 'a', shift: false })
  })

  test('letra maiuscula tem shift=true', () => {
    const keys = parseKey('I')
    expect(keys[0].name).toBe('i')
    expect(keys[0].shift).toBe(true)
  })

  test('numero', () => {
    expect(parseKey('1')[0].name).toBe('1')
    expect(parseKey('5')[0].name).toBe('5')
  })

  test('espaco', () => {
    expect(parseKey(' ')[0].name).toBe('space')
  })
})

describe('parseKey — controle', () => {
  test('enter \\r', () => {
    expect(parseKey('\r')[0].name).toBe('enter')
  })

  test('enter \\n', () => {
    expect(parseKey('\n')[0].name).toBe('enter')
  })

  test('tab', () => {
    expect(parseKey('\t')[0].name).toBe('tab')
  })

  test('backspace 0x7f', () => {
    expect(parseKey('\x7f')[0].name).toBe('backspace')
  })

  test('backspace \\b', () => {
    expect(parseKey('\b')[0].name).toBe('backspace')
  })

  test('escape sozinho', () => {
    expect(parseKey('\x1b')[0].name).toBe('escape')
  })
})

describe('parseKey — Ctrl+letra', () => {
  test('Ctrl+C', () => {
    const keys = parseKey('\x03')
    expect(keys[0].name).toBe('c')
    expect(keys[0].ctrl).toBe(true)
  })

  test('Ctrl+R', () => {
    const keys = parseKey('\x12')
    expect(keys[0].name).toBe('r')
    expect(keys[0].ctrl).toBe(true)
  })

  test('Ctrl+A', () => {
    const keys = parseKey('\x01')
    expect(keys[0].name).toBe('a')
    expect(keys[0].ctrl).toBe(true)
  })
})

describe('parseKey — setas (CSI)', () => {
  test('arrow up', () => {
    expect(parseKey('\x1b[A')[0].name).toBe('up')
  })
  test('arrow down', () => {
    expect(parseKey('\x1b[B')[0].name).toBe('down')
  })
  test('arrow right', () => {
    expect(parseKey('\x1b[C')[0].name).toBe('right')
  })
  test('arrow left', () => {
    expect(parseKey('\x1b[D')[0].name).toBe('left')
  })
})

describe('parseKey — navegacao avancada', () => {
  test('home', () => {
    expect(parseKey('\x1b[H')[0].name).toBe('home')
    expect(parseKey('\x1b[1~')[0].name).toBe('home')
  })
  test('end', () => {
    expect(parseKey('\x1b[F')[0].name).toBe('end')
    expect(parseKey('\x1b[4~')[0].name).toBe('end')
  })
  test('page up/down', () => {
    expect(parseKey('\x1b[5~')[0].name).toBe('pageup')
    expect(parseKey('\x1b[6~')[0].name).toBe('pagedown')
  })
  test('delete', () => {
    expect(parseKey('\x1b[3~')[0].name).toBe('delete')
  })
})

describe('parseKey — F-keys', () => {
  test('F1 via xterm legacy', () => {
    expect(parseKey('\x1bOP')[0].name).toBe('f1')
  })
  test('F1 via tilde', () => {
    expect(parseKey('\x1b[11~')[0].name).toBe('f1')
  })
  test('F5', () => {
    expect(parseKey('\x1b[15~')[0].name).toBe('f5')
  })
  test('F12', () => {
    expect(parseKey('\x1b[24~')[0].name).toBe('f12')
  })
})

describe('parseKey — Alt + letra', () => {
  test('alt+a', () => {
    const keys = parseKey('\x1ba')
    expect(keys[0].name).toBe('a')
    expect(keys[0].meta).toBe(true)
  })
})

describe('parseKey — paste com varias keys', () => {
  test('decodifica multiplas keys em um chunk', () => {
    const keys = parseKey('abc')
    expect(keys.map((k) => k.name)).toEqual(['a', 'b', 'c'])
  })

  test('texto com enter no meio', () => {
    const keys = parseKey('a\rb')
    expect(keys.map((k) => k.name)).toEqual(['a', 'enter', 'b'])
  })

  test('texto com seta no meio', () => {
    const keys = parseKey('a\x1b[Bb')
    expect(keys.map((k) => k.name)).toEqual(['a', 'down', 'b'])
  })
})

describe('parseKey — robustez', () => {
  test('chunk vazio', () => {
    expect(parseKey('')).toEqual([])
  })

  test('escape incompleto no fim', () => {
    // ESC sozinho no final → escape
    const keys = parseKey('\x1b')
    expect(keys).toHaveLength(1)
    expect(keys[0].name).toBe('escape')
  })

  test('CSI desconhecido nao crash', () => {
    // ESC[Z (back tab) — nao e parseado mas nao deve crash
    const keys = parseKey('\x1b[Z')
    expect(keys).toEqual([])
  })

  test('letras especiais com diacriticos sao tratados como char', () => {
    const keys = parseKey('á')
    expect(keys.length).toBeGreaterThan(0)
  })
})
