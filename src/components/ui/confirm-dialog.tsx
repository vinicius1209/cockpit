import { useState, useCallback, useRef, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertTriangle } from 'lucide-react'

interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** When set, requires user to type this string verbatim before confirming. Use for highly destructive actions. */
  requireText?: string
  /** 'destructive' shows a red theme (default). 'default' is neutral. */
  tone?: 'destructive' | 'default'
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

// Hook returning [confirm, dialogElement]. Render the element once near the top of your tree.
// Usage:
//   const [confirm, confirmDialog] = useConfirm()
//   const ok = await confirm({ title: 'Excluir projeto?' })
//   if (ok) doIt()
export function useConfirm(): [ConfirmFn, ReactNode] {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [typed, setTyped] = useState('')
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options)
    setTyped('')
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const finish = (result: boolean) => {
    setOpen(false)
    resolverRef.current?.(result)
    resolverRef.current = null
  }

  const tone = opts?.tone ?? 'destructive'
  const isDestructive = tone === 'destructive'
  const requireText = opts?.requireText
  const canConfirm = !requireText || typed === requireText

  const dialog = (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(false) }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Cockpit-style alert header */}
        <div className={`flex items-center gap-2 px-4 py-2.5 border-b font-mono text-[10px] uppercase tracking-[0.18em] ${
          isDestructive ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' : 'bg-muted/30 text-muted-foreground'
        }`}>
          <AlertTriangle className="h-3 w-3" />
          <span>━ {isDestructive ? 'ACAO DESTRUTIVA' : 'CONFIRMACAO'}</span>
        </div>

        <DialogHeader className="px-4 pt-4 pb-2 space-y-2">
          <DialogTitle className="text-base">{opts?.title}</DialogTitle>
          {opts?.description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {opts.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {requireText && (
          <div className="px-4 pb-3 space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Para confirmar, digite: <span className="text-foreground">{requireText}</span>
            </p>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-8 text-sm font-mono"
              placeholder={requireText}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t bg-muted/10">
          <Button variant="outline" size="sm" onClick={() => finish(false)}>
            {opts?.cancelLabel || 'Cancelar'}
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            size="sm"
            disabled={!canConfirm}
            onClick={() => finish(true)}
          >
            {opts?.confirmLabel || (isDestructive ? 'Excluir' : 'Confirmar')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return [confirm, dialog]
}
