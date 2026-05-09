import type { Card, Workspace } from './client'

// Converte ID longo (cuid-like) em #XXXX (últimos 4 alfa-num em uppercase).
// Espelha a lógica do flight strip do web UI.
export function shortId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
}

// Resolve uma referencia (cardId completo, #SHORT, ou prefix) num card real.
// Aceita: "card-abc-1234", "SW78", "#SW78", "sw78"
export function resolveCard(ref: string, cards: Card[]): Card | undefined {
  if (!ref) return undefined
  const cleaned = ref.replace(/^#/, '').toLowerCase()

  // Match exato pelo id completo
  const exact = cards.find((c) => c.id === ref)
  if (exact) return exact

  // Match pelo short id
  const short = cards.find((c) => shortId(c.id).toLowerCase() === cleaned)
  if (short) return short

  // Match por prefix do id
  const prefix = cards.filter((c) => c.id.toLowerCase().startsWith(cleaned))
  if (prefix.length === 1) return prefix[0]

  return undefined
}

export function resolveWorkspace(ref: string, workspaces: Workspace[]): Workspace | undefined {
  if (!ref) return undefined
  const lower = ref.toLowerCase()
  return workspaces.find((w) => w.slug === lower || w.name.toLowerCase() === lower || w.id === ref)
}
