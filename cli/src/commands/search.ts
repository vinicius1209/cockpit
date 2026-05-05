import { loadAll } from '../api/store'
import { shortId } from '../api/resolve'
import { c } from '../ui/colors'
import { divider } from '../ui/box'

interface SearchOpts {
  in?: string  // 'cards' | 'specs' | 'all' (default)
  asJson?: boolean
  limit?: number
}

interface Hit {
  cardId: string
  cardTitle: string
  cardType: string
  workspace: string
  workspaceSlug: string
  field: 'title' | 'description' | 'spec' | 'interview'
  excerpt: string
  score: number
}

export async function search(query: string, opts: SearchOpts = {}): Promise<void> {
  if (!query || query.trim().length === 0) {
    console.error(c.rose('✕ query obrigatoria'))
    console.log(c.dim('  uso: cockpit search "<termo>"'))
    process.exit(1)
  }

  const q = query.toLowerCase()
  const { workspaces, cards } = await loadAll()
  const wsById = new Map(workspaces.map((w) => [w.id, w]))

  const filter = opts.in || 'all'
  const hits: Hit[] = []

  for (const card of cards) {
    const ws = wsById.get(card.workspace_id)
    if (!ws) continue

    if ((filter === 'all' || filter === 'cards') && card.title.toLowerCase().includes(q)) {
      hits.push({
        cardId: card.id, cardTitle: card.title, cardType: card.type,
        workspace: ws.name, workspaceSlug: ws.slug,
        field: 'title', excerpt: highlight(card.title, q),
        score: 10,
      })
    }
    if ((filter === 'all' || filter === 'cards') && card.description?.toLowerCase().includes(q)) {
      hits.push({
        cardId: card.id, cardTitle: card.title, cardType: card.type,
        workspace: ws.name, workspaceSlug: ws.slug,
        field: 'description', excerpt: extractExcerpt(card.description, q),
        score: 5,
      })
    }
    if ((filter === 'all' || filter === 'specs') && card.spec_content?.toLowerCase().includes(q)) {
      hits.push({
        cardId: card.id, cardTitle: card.title, cardType: card.type,
        workspace: ws.name, workspaceSlug: ws.slug,
        field: 'spec', excerpt: extractExcerpt(card.spec_content, q),
        score: 7,
      })
    }
    if ((filter === 'all') && card.interview_notes?.toLowerCase().includes(q)) {
      hits.push({
        cardId: card.id, cardTitle: card.title, cardType: card.type,
        workspace: ws.name, workspaceSlug: ws.slug,
        field: 'interview', excerpt: extractExcerpt(card.interview_notes, q),
        score: 3,
      })
    }
  }

  // Sort by score
  hits.sort((a, b) => b.score - a.score)
  const limited = hits.slice(0, opts.limit || 20)

  if (opts.asJson) {
    console.log(JSON.stringify(limited, null, 2))
    return
  }

  console.log(divider(`SEARCH · "${query}"`, 'cyan'))
  console.log()
  if (limited.length === 0) {
    console.log(c.dim('  nenhum resultado.'))
    return
  }

  console.log(c.dim(`  ${hits.length} match${hits.length === 1 ? '' : 'es'}${hits.length > limited.length ? ` (mostrando ${limited.length})` : ''}`))
  console.log()

  for (const h of limited) {
    console.log(`  ${c.dim('#' + shortId(h.cardId))} ${c.bold(h.cardTitle)} ${c.dim('· ' + h.cardType)} ${c.dim(h.workspace)}`)
    console.log(`    ${c.dim(`[${h.field}]`)} ${h.excerpt}`)
    console.log()
  }
}

function highlight(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q)
  if (idx < 0) return text
  return text.slice(0, idx) + c.amber(c.bold(text.slice(idx, idx + q.length))) + text.slice(idx + q.length)
}

function extractExcerpt(text: string, q: string, ctx = 40): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) return text.slice(0, 80)

  const start = Math.max(0, idx - ctx)
  const end = Math.min(text.length, idx + q.length + ctx)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const snippet = text.slice(start, end).replace(/\n+/g, ' ')
  return prefix + highlight(snippet, q) + suffix
}
