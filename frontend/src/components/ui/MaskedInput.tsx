import { type InputHTMLAttributes, useMemo } from 'react'
import { cn } from '../../lib/utils'

interface Mask {
  format: (raw: string) => string
  unformat: (display: string) => string
}

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Valor "cru" — só dígitos. */
  value: string
  /** Recebe o valor cru (sem máscara) já truncado ao tamanho permitido. */
  onChange: (raw: string) => void
  mask: Mask
  invalid?: boolean
}

/**
 * Input com máscara visual. O componente armazena/expõe sempre o valor cru
 * (somente dígitos), mas exibe formatado para o usuário. A máscara é
 * recalculada a cada digitação.
 */
export function MaskedInput({ value, onChange, mask, invalid, className, ...rest }: Props) {
  const display = useMemo(() => mask.format(value), [value, mask])

  return (
    <input
      {...rest}
      value={display}
      onChange={e => onChange(mask.unformat(e.target.value))}
      inputMode="numeric"
      className={cn(
        'text-sm border rounded-lg bg-background px-3 py-2 focus:outline-none focus:ring-2',
        invalid
          ? 'border-rose-300 focus:ring-rose-200 focus:border-rose-400'
          : 'border-border focus:ring-primary/20 focus:border-primary',
        className,
      )}
    />
  )
}
