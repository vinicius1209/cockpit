// Validador minimal de inputs MCP — fix I6 do code review.
//
// Antes: tools faziam `args as unknown as XArgs` sem checar nada. LLM
// passando { title: null } ou omitindo required fields causava crashes
// confusos pro lado do LLM ("Cannot read property X of undefined").
//
// Agora: cada handler chama `validateInput(args, spec)` no comeco. Spec
// declara campos required + optional + tipo esperado. Erro retorna
// mensagem clara que o LLM consegue entender e corrigir.
//
// Por que não zod: deps zero, cobertura suficiente pra nossos casos
// (string, number, boolean, enum). Se ficar complexo demais, migra-se
// pro zod sem grande custo.

export interface FieldSpec {
  /** Tipo esperado. */
  type: 'string' | 'number' | 'boolean' | 'enum'
  /** Required: ausencia ou null vira erro. */
  required?: boolean
  /** Pra enum: valores aceitos. */
  values?: readonly string[]
  /** Pra string: comprimento mínimo (default 1 se required). */
  minLength?: number
  /** Pra string: comprimento máximo. */
  maxLength?: number
  /** Pra number: mínimo. */
  min?: number
  /** Pra number: máximo. */
  max?: number
}

export type InputSpec = Record<string, FieldSpec>

export class McpInputError extends Error {
  constructor(public field: string, public reason: string) {
    super(`input inválido: campo "${field}" — ${reason}`)
    this.name = 'McpInputError'
  }
}

/**
 * Valida que `args` corresponde ao `spec`. Throws McpInputError com mensagem
 * clara em caso de problema. Se passar, retorna `args` tipado de volta —
 * caller pode usar com confianca.
 *
 * Side effect: campos NAO declarados no spec são mantidos passthrough
 * (intencional — pra extensibilidade futura sem breaking).
 */
export function validateInput<T>(
  rawArgs: unknown,
  spec: InputSpec,
): T {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    throw new McpInputError('_root', 'esperava objeto, recebeu ' + typeof rawArgs)
  }
  const args = rawArgs as Record<string, unknown>

  for (const [field, fieldSpec] of Object.entries(spec)) {
    const value = args[field]
    const isAbsent = value === undefined || value === null

    if (isAbsent) {
      if (fieldSpec.required) {
        throw new McpInputError(field, 'obrigatório (recebeu ' + (value === null ? 'null' : 'undefined') + ')')
      }
      continue  // optional + ausente = ok
    }

    // Type check
    if (fieldSpec.type === 'string') {
      if (typeof value !== 'string') {
        throw new McpInputError(field, `esperava string, recebeu ${typeof value}`)
      }
      const minLen = fieldSpec.minLength ?? (fieldSpec.required ? 1 : 0)
      if (value.length < minLen) {
        throw new McpInputError(field, `comprimento mínimo ${minLen} (recebeu ${value.length})`)
      }
      if (fieldSpec.maxLength != null && value.length > fieldSpec.maxLength) {
        throw new McpInputError(field, `comprimento máximo ${fieldSpec.maxLength} (recebeu ${value.length})`)
      }
    } else if (fieldSpec.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new McpInputError(field, `esperava number, recebeu ${typeof value}`)
      }
      if (fieldSpec.min != null && value < fieldSpec.min) {
        throw new McpInputError(field, `mínimo ${fieldSpec.min} (recebeu ${value})`)
      }
      if (fieldSpec.max != null && value > fieldSpec.max) {
        throw new McpInputError(field, `máximo ${fieldSpec.max} (recebeu ${value})`)
      }
    } else if (fieldSpec.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new McpInputError(field, `esperava boolean, recebeu ${typeof value}`)
      }
    } else if (fieldSpec.type === 'enum') {
      if (typeof value !== 'string' || !fieldSpec.values?.includes(value)) {
        throw new McpInputError(field, `esperava um de ${JSON.stringify(fieldSpec.values || [])}, recebeu ${JSON.stringify(value)}`)
      }
    }
  }

  return args as unknown as T
}

// Specs reutilizaveis dos campos mais comuns
export const COMMON_SPECS = {
  card_id: { type: 'string' as const, required: true, minLength: 1, maxLength: 200 },
  workspace: { type: 'string' as const, minLength: 1, maxLength: 100 },
  type: { type: 'enum' as const, values: ['feature', 'bugfix', 'hotfix', 'discovery', 'chore', 'improvement'] as const },
  priority: { type: 'enum' as const, values: ['critical', 'high', 'medium', 'low'] as const },
  spec_status: { type: 'enum' as const, values: ['draft', 'ready', 'in_progress', 'review', 'done'] as const },
  isolation: { type: 'enum' as const, values: ['lock', 'worktree'] as const },
}
