import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn, normalize } from '../../lib/utils'

export interface ComboBoxOption {
  value: string
  label: string
  /** Texto extra usado só pra busca (ex: código, sigla). Não exibido. */
  searchText?: string
  /** Texto secundário cinza ao lado do label. */
  hint?: string
}

interface Props {
  value: string | null
  options: ComboBoxOption[]
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  /** Quando true, oculta o botão "limpar". */
  required?: boolean
  className?: string
}

/**
 * Select com busca. Filtra por label + searchText (acentos ignorados).
 * Fecha ao clicar fora ou pressionar Escape. Suporta keyboard nav.
 */
export function ComboBox({
  value, options, onChange, placeholder = 'Selecione...',
  disabled, invalid, required, className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => options.find(o => o.value === value) ?? null,
    [options, value],
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = normalize(query)
    return options.filter(o => {
      const text = normalize(`${o.label} ${o.searchText ?? ''} ${o.hint ?? ''}`)
      return text.includes(q)
    })
  }, [options, query])

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Foca o search ao abrir / limpa o termo ao fechar.
  // Como o reset de highlight/query é derivado de `open`, fazemos no handler
  // (não no effect, pra não cair na regra react-hooks/set-state-in-effect).
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const toggle = () => {
    if (disabled) return
    setOpen(prev => {
      const next = !prev
      if (next) setHighlight(0)
      else setQuery('')
      return next
    })
  }

  const choose = (val: string) => {
    onChange(val)
    setQuery('')
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' && filtered[highlight]) {
      e.preventDefault()
      choose(filtered[highlight].value)
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onKey}
        className={cn(
          'w-full flex items-center justify-between gap-2 text-sm border rounded-lg bg-background px-3 py-2 text-left',
          'focus:outline-none focus:ring-2',
          invalid
            ? 'border-rose-300 dark:border-rose-800 focus:ring-rose-200 dark:focus:ring-rose-900 focus:border-rose-400'
            : 'border-border focus:ring-primary/20 focus:border-primary',
          disabled && 'bg-muted/40 text-muted-foreground cursor-not-allowed',
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground/70')}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && !required && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={e => { e.stopPropagation(); onChange(null) }}
              className="p-0.5 rounded text-muted-foreground hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute z-[1100] mt-1 w-full bg-white dark:bg-slate-900 border border-border rounded-lg shadow-lg overflow-hidden max-h-72 flex flex-col">
          <div className="relative border-b border-border">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlight(0) }}
              onKeyDown={onKey}
              placeholder="Buscar..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-transparent focus:outline-none"
            />
          </div>
          <ul className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted-foreground text-center">Nada encontrado.</li>
            ) : filtered.map((opt, i) => {
              const isSelected = opt.value === value
              const isHighlighted = i === highlight
              return (
                <li
                  key={opt.value}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(opt.value)}
                  className={cn(
                    'px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2',
                    isHighlighted && 'bg-primary/10',
                    isSelected && 'font-medium',
                  )}
                >
                  <Check size={12} className={cn('shrink-0', !isSelected && 'invisible')} />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.hint && <span className="text-xs text-muted-foreground">{opt.hint}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
