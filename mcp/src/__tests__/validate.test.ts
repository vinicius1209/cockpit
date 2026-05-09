// Tests do validator (I6 fix). Cobertura focada em garantir mensagens
// claras pro LLM em casos de input invalido.

import { describe, test, expect } from 'bun:test'
import { validateInput, McpInputError, COMMON_SPECS } from '../validate'

describe('validateInput — basics', () => {
  test('args validos passam', () => {
    const out = validateInput<{ name: string }>({ name: 'foo' }, {
      name: { type: 'string', required: true },
    })
    expect(out.name).toBe('foo')
  })

  test('campos extra sao mantidos passthrough', () => {
    const out = validateInput<Record<string, unknown>>({ name: 'foo', extra: 42 }, {
      name: { type: 'string', required: true },
    })
    expect(out.name).toBe('foo')
    expect(out.extra).toBe(42)
  })

  test('rawArgs nao-objeto throws', () => {
    expect(() => validateInput<unknown>('not-object', {})).toThrow(McpInputError)
    expect(() => validateInput<unknown>(42, {})).toThrow(McpInputError)
    expect(() => validateInput<unknown>(null, {})).toThrow(McpInputError)
    expect(() => validateInput<unknown>([], {})).toThrow(McpInputError)
  })
})

describe('validateInput — required', () => {
  test('required ausente throws com mensagem clara', () => {
    let err: McpInputError | null = null
    try {
      validateInput<unknown>({}, { name: { type: 'string', required: true } })
    } catch (e) {
      err = e as McpInputError
    }
    expect(err).toBeInstanceOf(McpInputError)
    expect(err!.field).toBe('name')
    expect(err!.message).toContain('obrigatorio')
  })

  test('required null throws', () => {
    expect(() => validateInput<unknown>({ name: null }, { name: { type: 'string', required: true } })).toThrow(/obrigatorio/)
  })

  test('optional ausente passa', () => {
    const out = validateInput<{ name?: string }>({}, { name: { type: 'string' } })
    expect(out.name).toBeUndefined()
  })
})

describe('validateInput — string', () => {
  test('tipo errado throws', () => {
    expect(() => validateInput<unknown>({ name: 42 }, { name: { type: 'string' } })).toThrow(/string/)
  })

  test('minLength', () => {
    expect(() => validateInput<unknown>({ name: '' }, { name: { type: 'string', required: true, minLength: 3 } }))
      .toThrow(/comprimento minimo 3/)
  })

  test('maxLength', () => {
    expect(() => validateInput<unknown>({ name: 'abcdef' }, { name: { type: 'string', maxLength: 3 } }))
      .toThrow(/comprimento maximo 3/)
  })
})

describe('validateInput — number', () => {
  test('tipo errado', () => {
    expect(() => validateInput<unknown>({ n: 'abc' }, { n: { type: 'number' } })).toThrow(/number/)
  })

  test('min/max', () => {
    expect(() => validateInput<unknown>({ n: -1 }, { n: { type: 'number', min: 0 } })).toThrow(/minimo 0/)
    expect(() => validateInput<unknown>({ n: 100 }, { n: { type: 'number', max: 50 } })).toThrow(/maximo 50/)
  })

  test('NaN/Infinity rejeitados', () => {
    expect(() => validateInput<unknown>({ n: NaN }, { n: { type: 'number' } })).toThrow()
    expect(() => validateInput<unknown>({ n: Infinity }, { n: { type: 'number' } })).toThrow()
  })
})

describe('validateInput — boolean', () => {
  test('tipo errado', () => {
    expect(() => validateInput<unknown>({ ok: 'yes' }, { ok: { type: 'boolean' } })).toThrow(/boolean/)
  })

  test('boolean correto', () => {
    expect(validateInput<{ ok: boolean }>({ ok: true }, { ok: { type: 'boolean' } }).ok).toBe(true)
    expect(validateInput<{ ok: boolean }>({ ok: false }, { ok: { type: 'boolean' } }).ok).toBe(false)
  })
})

describe('validateInput — enum', () => {
  test('valor fora do enum throws', () => {
    expect(() => validateInput<unknown>({ x: 'foo' }, { x: { type: 'enum', values: ['a', 'b'] as const } }))
      .toThrow(/esperava um de/)
  })

  test('valor dentro do enum passa', () => {
    expect(validateInput<{ x: string }>({ x: 'a' }, { x: { type: 'enum', values: ['a', 'b'] as const } }).x).toBe('a')
  })
})

describe('COMMON_SPECS — sanity', () => {
  test('card_id valida', () => {
    expect(() => validateInput<unknown>({ card_id: '' }, { card_id: COMMON_SPECS.card_id })).toThrow()
    expect(validateInput<{ card_id: string }>({ card_id: 'SW78' }, { card_id: COMMON_SPECS.card_id }).card_id).toBe('SW78')
  })

  test('priority enum', () => {
    expect(() => validateInput<unknown>({ priority: 'urgent' }, { priority: COMMON_SPECS.priority })).toThrow()
    expect(validateInput<{ priority: string }>({ priority: 'high' }, { priority: COMMON_SPECS.priority }).priority).toBe('high')
  })
})
