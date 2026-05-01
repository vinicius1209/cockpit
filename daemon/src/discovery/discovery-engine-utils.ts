import type { TodoItem } from '../scanner/project-scanner'
import type { DiscoveryCard } from './discovery-engine'

function inferSubProject(filePath: string, subProjectNames: string[]): string | undefined {
  const firstSegment = filePath.split('/')[0]
  return subProjectNames.includes(firstSegment) ? firstSegment : undefined
}

export function todosToCards(todos: TodoItem[], subProjectNames: string[]): DiscoveryCard[] {
  const fixmes = todos.filter((t) => t.type === 'FIXME' || t.type === 'BUG')
  const hacks = todos.filter((t) => t.type === 'HACK')
  const regularTodos = todos.filter((t) => t.type === 'TODO')

  const cards: DiscoveryCard[] = []

  for (const fixme of fixmes.slice(0, 10)) {
    cards.push({
      title: `FIXME: ${fixme.text.replace(/\/\/\s*(FIXME|BUG):?\s*/i, '').slice(0, 80)}`,
      description: `Encontrado em ${fixme.file}:${fixme.line}\n\n\`\`\`\n${fixme.text}\n\`\`\``,
      type: 'bugfix',
      priority: 'high',
      source: 'scanner',
      metadata: { file: fixme.file, line: String(fixme.line) },
      subProject: inferSubProject(fixme.file, subProjectNames),
    })
  }

  if (hacks.length > 0) {
    cards.push({
      title: `${hacks.length} HACKs encontrados no codigo`,
      description: `Locais:\n${hacks.slice(0, 10).map((h) => `- ${h.file}:${h.line} — ${h.text.slice(0, 100)}`).join('\n')}`,
      type: 'improvement',
      priority: 'medium',
      source: 'scanner',
      metadata: { count: String(hacks.length) },
    })
  }

  if (regularTodos.length > 5) {
    cards.push({
      title: `${regularTodos.length} TODOs pendentes no codigo`,
      description: `Exemplos:\n${regularTodos.slice(0, 10).map((t) => `- ${t.file}:${t.line} — ${t.text.slice(0, 100)}`).join('\n')}`,
      type: 'chore',
      priority: 'low',
      source: 'scanner',
      metadata: { count: String(regularTodos.length) },
    })
  }

  return cards
}
