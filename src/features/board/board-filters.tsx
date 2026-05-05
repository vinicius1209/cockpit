import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CARD_TYPES, CARD_PRIORITIES } from '@/entities/card/types'
import type { CardType, CardPriority, Label } from '@/entities/card/types'
import { CARD_TYPE_CONFIG, CARD_PRIORITY_CONFIG } from '@/shared/lib/constants'
import { Filter, X, Archive as ArchiveIcon } from 'lucide-react'

export interface BoardFilters {
  types: CardType[]
  priorities: CardPriority[]
  labelIds: string[]
  /** F10 — true mostra archived junto. Default false. */
  includeArchived?: boolean
}

interface BoardFiltersBarProps {
  filters: BoardFilters
  onChange: (filters: BoardFilters) => void
  totalCards: number
  filteredCards: number
  labels: Label[]
  archivedCount?: number
}

export function BoardFiltersBar({ filters, onChange, totalCards, filteredCards, labels, archivedCount = 0 }: BoardFiltersBarProps) {
  const hasFilters = filters.types.length > 0 || filters.priorities.length > 0 || filters.labelIds.length > 0 || !!filters.includeArchived

  const toggleType = (type: CardType) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type]
    onChange({ ...filters, types })
  }

  const togglePriority = (priority: CardPriority) => {
    const priorities = filters.priorities.includes(priority)
      ? filters.priorities.filter((p) => p !== priority)
      : [...filters.priorities, priority]
    onChange({ ...filters, priorities })
  }

  const toggleLabel = (labelId: string) => {
    const labelIds = filters.labelIds.includes(labelId)
      ? filters.labelIds.filter((id) => id !== labelId)
      : [...filters.labelIds, labelId]
    onChange({ ...filters, labelIds })
  }

  const clearFilters = () => onChange({ types: [], priorities: [], labelIds: [], includeArchived: false })

  const toggleArchived = () => onChange({ ...filters, includeArchived: !filters.includeArchived })

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Filtros</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {CARD_TYPES.map((type) => {
          const config = CARD_TYPE_CONFIG[type]
          const active = filters.types.includes(type)
          return (
            <Badge
              key={type}
              variant={active ? 'default' : 'outline'}
              className={`cursor-pointer text-[10px] px-1.5 py-0 transition-colors ${active ? `${config.bgColor} ${config.color} border-0` : 'opacity-60 hover:opacity-100'}`}
              onClick={() => toggleType(type)}
            >
              {config.label}
            </Badge>
          )
        })}
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-1 flex-wrap">
        {CARD_PRIORITIES.map((priority) => {
          const config = CARD_PRIORITY_CONFIG[priority]
          const active = filters.priorities.includes(priority)
          return (
            <Badge
              key={priority}
              variant={active ? 'default' : 'outline'}
              className={`cursor-pointer text-[10px] px-1.5 py-0 transition-colors ${active ? `${config.bgColor} ${config.color} border-0` : 'opacity-60 hover:opacity-100'}`}
              onClick={() => togglePriority(priority)}
            >
              {config.label}
            </Badge>
          )
        })}
      </div>

      {labels.length > 0 && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1 flex-wrap">
            {labels.map((label) => {
              const active = filters.labelIds.includes(label.id)
              return (
                <Badge
                  key={label.id}
                  variant={active ? 'default' : 'outline'}
                  className={`cursor-pointer text-[10px] px-1.5 py-0 transition-colors ${active ? 'text-white border-0' : 'opacity-60 hover:opacity-100'}`}
                  style={active ? { backgroundColor: label.color } : undefined}
                  onClick={() => toggleLabel(label.id)}
                >
                  {!active && (
                    <span className="h-2 w-2 rounded-full mr-1 inline-block" style={{ backgroundColor: label.color }} />
                  )}
                  {label.name}
                </Badge>
              )
            })}
          </div>
        </>
      )}

      {archivedCount > 0 && (
        <>
          <div className="h-4 w-px bg-border" />
          <Badge
            variant={filters.includeArchived ? 'default' : 'outline'}
            className={`cursor-pointer text-[10px] px-1.5 py-0 transition-colors gap-1 ${filters.includeArchived ? 'bg-amber-500/15 text-amber-500 border-amber-500/40' : 'opacity-60 hover:opacity-100'}`}
            onClick={toggleArchived}
            title={filters.includeArchived ? 'Esconder descartados' : 'Mostrar descartados'}
          >
            <ArchiveIcon className="h-2.5 w-2.5" />
            descartados
            <span className="tabular-nums opacity-70">{archivedCount}</span>
          </Badge>
        </>
      )}

      {hasFilters && (
        <>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {filteredCards}/{totalCards}
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3 w-3 mr-0.5" />
            Limpar
          </Button>
        </>
      )}
    </div>
  )
}
