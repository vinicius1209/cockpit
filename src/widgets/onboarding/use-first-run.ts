// Detecta primeiro uso e gerencia "já viu o tutorial?" via localStorage.
// Triggers wizard automaticamente quando: zero cards (mesmo com seed
// workspaces) E o usuario nunca viu o tutorial.

import { useEffect, useState } from 'react'
import { useCardStore } from '@/entities/card/store'

const SEEN_KEY = 'cockpit-first-run-seen'

export function useFirstRun(): {
  open: boolean
  setOpen: (v: boolean) => void
  showAgain: () => void
} {
  const [open, setOpen] = useState(false)
  const cards = useCardStore((s) => s.cards)

  useEffect(() => {
    // Soh dispara uma vez por sessão do browser
    if (typeof window === 'undefined') return
    const seen = localStorage.getItem(SEEN_KEY)
    if (seen) return
    if (cards.length === 0) {
      // Pequeno delay pra UI carregar primeiro
      const id = setTimeout(() => setOpen(true), 600)
      return () => clearTimeout(id)
    }
  }, [cards.length])

  const handleClose = (v: boolean) => {
    if (!v) {
      localStorage.setItem(SEEN_KEY, '1')
    }
    setOpen(v)
  }

  const showAgain = () => {
    localStorage.removeItem(SEEN_KEY)
    setOpen(true)
  }

  return {
    open,
    setOpen: handleClose,
    showAgain,
  }
}
