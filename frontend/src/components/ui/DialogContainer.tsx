import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, HelpCircle, X } from 'lucide-react'
import { useDialogStore, type Dialog } from '../../store/dialogStore'
import { cn } from '../../lib/utils'

/**
 * Renderiza o diálogo da fila no topo (um por vez). Monte uma única vez,
 * geralmente dentro de AppShell/SysShell.
 */
export function DialogContainer() {
  const queue = useDialogStore(s => s.queue)
  const dialog = queue[0]
  if (!dialog) return null
  return <DialogRenderer key={dialog.id} dialog={dialog} />
}

function DialogRenderer({ dialog }: { dialog: Dialog }) {
  const resolve = useDialogStore(s => s.resolve)
  const [value, setValue] = useState(
    dialog.kind === 'prompt' ? (dialog.defaultValue ?? '') : '',
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // Foco automático: input no prompt, botão confirmar no confirm.
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (dialog.kind === 'prompt') inputRef.current?.focus()
    else confirmBtnRef.current?.focus()
  }, [dialog.kind])

  // ESC cancela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolve(dialog.id, dialog.kind === 'prompt' ? null : false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog, resolve])

  const handleConfirm = () => {
    if (dialog.kind === 'prompt') resolve(dialog.id, value)
    else resolve(dialog.id, true)
  }
  const handleCancel = () => {
    resolve(dialog.id, dialog.kind === 'prompt' ? null : false)
  }

  const variant = dialog.variant ?? 'default'
  const Icon = variant === 'danger' ? AlertTriangle : HelpCircle
  const iconColor = variant === 'danger'
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-primary'
  const iconBg = variant === 'danger'
    ? 'bg-rose-100 dark:bg-rose-950/40'
    : 'bg-primary/10'
  const confirmBtnCls = variant === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : 'bg-primary hover:bg-primary/90 text-primary-foreground'

  return (
    <div
      onClick={handleCancel}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-md overflow-hidden"
      >
        <div className="flex items-start gap-4 p-5">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', iconBg)}>
            <Icon size={18} className={iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-snug">{dialog.title}</h3>
            {dialog.message && (
              <p className="text-sm text-muted-foreground mt-1">{dialog.message}</p>
            )}
            {dialog.kind === 'prompt' && (
              <input
                ref={inputRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                placeholder={dialog.placeholder}
                className="mt-3 w-full text-sm border border-border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            )}
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
          >
            {dialog.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            className={cn('px-4 py-1.5 text-sm font-medium rounded-lg transition-colors', confirmBtnCls)}
          >
            {dialog.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
