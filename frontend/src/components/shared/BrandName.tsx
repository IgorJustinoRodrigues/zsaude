// Exibição do nome do sistema (configurável via `app_name`).
//
// Heurística: se o nome começa com letra minúscula "z" (padrão zSaúde),
// renderiza a primeira letra em cor base e o resto em cor de destaque.
// Caso contrário, exibe inteiro sem destaque.

import { useAppInfoStore } from '../../store/appInfoStore'
import { cn } from '../../lib/utils'

interface Props {
  /** Classe da cor de destaque (ex: 'text-sky-500'). */
  accentClassName?: string
  className?: string
}

export function BrandName({ accentClassName = 'text-sky-500', className }: Props) {
  const name = useAppInfoStore(s => s.info.appName)

  const useSplit = /^z[A-Z]/.test(name)
  if (useSplit) {
    const head = name[0]
    const rest = name.slice(1)
    return (
      <span className={className}>
        {head}<span className={cn(accentClassName)}>{rest}</span>
      </span>
    )
  }
  return <span className={className}>{name}</span>
}
