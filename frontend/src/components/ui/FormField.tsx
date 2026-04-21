import { type ReactNode } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  label: string
  required?: boolean
  hint?: string
  error?: string | null
  /** Quando true, mostra ícone de check (campo válido + preenchido). */
  valid?: boolean
  className?: string
  children: ReactNode
}

/**
 * Wrapper padrão para inputs do form. Cuida de label, asterisco
 * de obrigatoriedade, mensagem de erro e dica.
 */
export function FormField({ label, required, hint, error, valid, className, children }: Props) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500 dark:text-rose-400">*</span>}
        {valid && !error && <Check size={11} className="text-emerald-500 dark:text-emerald-400 ml-0.5" />}
      </span>
      {children}
      {error ? (
        <span className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-0.5">
          <AlertCircle size={11} />
          {error}
        </span>
      ) : hint ? (
        <span className="text-[11px] text-muted-foreground/80">{hint}</span>
      ) : null}
    </label>
  )
}
