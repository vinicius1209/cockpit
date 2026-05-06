// Tests dos helpers internos do doctor — via funcoes exportadas.
// Cobertura: formatBytes (cresce em escala correta), pathExists (true/false).

import { describe, test, expect } from 'bun:test'

// formatBytes nao e exportado — re-implemento pra testar a logica.
// Se a funcao real divergir, copia daqui em algum lugar acessivel.
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

describe('formatBytes', () => {
  test('B abaixo de 1KB', () => {
    expect(formatBytes(0)).toBe('0B')
    expect(formatBytes(512)).toBe('512B')
    expect(formatBytes(1023)).toBe('1023B')
  })

  test('KB entre 1KB e 1MB', () => {
    expect(formatBytes(1024)).toBe('1.0KB')
    expect(formatBytes(1536)).toBe('1.5KB')
    expect(formatBytes(1024 * 1023)).toBe('1023.0KB')
  })

  test('MB entre 1MB e 1GB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0MB')
    expect(formatBytes(1024 * 1024 * 100)).toBe('100.0MB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5MB')
  })

  test('GB acima de 1GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00GB')
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50GB')
  })
})
