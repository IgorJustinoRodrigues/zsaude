import { useEffect, useRef, useState } from 'react'
import { Accessibility, Type, Eye, Zap, AlignLeft, RotateCcw, Check } from 'lucide-react'
import {
  applyAccessibility,
  useAccessibilityStore,
  type FontFamilyOption,
  type FontScaleOption,
  type LineSpacingOption,
} from '../../store/accessibilityStore'
import { cn } from '../../lib/utils'

const FONT_SCALES: { value: FontScaleOption; label: string }[] = [
  { value: 0.875, label: 'A−' },
  { value: 1,     label: 'A' },
  { value: 1.125, label: 'A+' },
  { value: 1.25,  label: 'A++' },
  { value: 1.5,   label: 'A+++' },
]

const FONTS: { value: FontFamilyOption; label: string; preview: string; sample: string }[] = [
  { value: 'default', label: 'Padrão (Inter)', preview: 'Aa', sample: 'sans-serif moderna' },
  { value: 'lexend',  label: 'Lexend',         preview: 'Aa', sample: 'otimizada para leitura' },
  { value: 'verdana', label: 'Verdana',        preview: 'Aa', sample: 'alta legibilidade em tela' },
  { value: 'tahoma',  label: 'Tahoma',         preview: 'Aa', sample: 'compacta e legível' },
  { value: 'arial',   label: 'Arial',          preview: 'Aa', sample: 'universal' },
  { value: 'serif',   label: 'Serifada',       preview: 'Aa', sample: 'estilo livro' },
]

const SPACINGS: { value: LineSpacingOption; label: string }[] = [
  { value: 'normal',  label: 'Normal' },
  { value: 'relaxed', label: 'Relaxado' },
  { value: 'loose',   label: 'Espaçado' },
]

/**
 * Botão de acessibilidade + popover com opções. Reaplica preferências
 * no <html> sempre que mudam.
 */
export function AccessibilityMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const a11y = useAccessibilityStore()
  const { fontScale, fontFamily, highContrast, reduceMotion, lineSpacing } = a11y

  // Aplica ao montar e a cada mudança nas prefs.
  useEffect(() => {
    applyAccessibility({ fontScale, fontFamily, highContrast, reduceMotion, lineSpacing })
  }, [fontScale, fontFamily, highContrast, reduceMotion, lineSpacing])

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Acessibilidade"
        aria-label="Opções de acessibilidade"
        className={cn(
          'p-2 rounded-lg transition-colors',
          'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          open && 'bg-slate-100 dark:bg-slate-800',
        )}
      >
        <Accessibility size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Acessibilidade</p>
              <p className="text-xs text-muted-foreground">Preferências salvas neste navegador</p>
            </div>
            <button
              type="button"
              onClick={a11y.reset}
              title="Restaurar padrões"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
            {/* Tamanho da fonte */}
            <Section icon={<Type size={13} />} title="Tamanho da fonte">
              <div className="grid grid-cols-5 gap-1">
                {FONT_SCALES.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => a11y.setFontScale(opt.value)}
                    className={cn(
                      'py-2 rounded-lg text-sm border transition-colors',
                      a11y.fontScale === opt.value
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border hover:bg-muted',
                    )}
                    style={{ fontSize: `${0.7 * opt.value}rem` }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* Fonte */}
            <Section icon={<Type size={13} />} title="Família de fonte">
              <div className="space-y-1">
                {FONTS.map(f => {
                  const active = a11y.fontFamily === f.value
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => a11y.setFontFamily(f.value)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted',
                      )}
                    >
                      <span
                        className="text-lg font-semibold w-7 text-center shrink-0"
                        style={{ fontFamily: fontFamilyCss(f.value) }}
                      >
                        {f.preview}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm block truncate" style={{ fontFamily: fontFamilyCss(f.value) }}>
                          {f.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{f.sample}</span>
                      </span>
                      {active && <Check size={13} className="text-primary shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </Section>

            {/* Espaçamento */}
            <Section icon={<AlignLeft size={13} />} title="Espaçamento entre linhas">
              <div className="grid grid-cols-3 gap-1">
                {SPACINGS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => a11y.setLineSpacing(s.value)}
                    className={cn(
                      'py-2 rounded-lg text-xs border transition-colors',
                      a11y.lineSpacing === s.value
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* Toggles */}
            <ToggleRow
              icon={<Eye size={13} />}
              label="Alto contraste"
              hint="Bordas mais escuras e foco marcado"
              checked={a11y.highContrast}
              onChange={a11y.setHighContrast}
            />
            <ToggleRow
              icon={<Zap size={13} />}
              label="Reduzir animações"
              hint="Desativa transições e efeitos"
              checked={a11y.reduceMotion}
              onChange={a11y.setReduceMotion}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        {icon} {title}
      </p>
      {children}
    </div>
  )
}

function ToggleRow({ icon, label, hint, checked, onChange }: {
  icon: React.ReactNode; label: string; hint?: string;
  checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 py-2"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-left">
        <span className="text-sm block">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors shrink-0',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  )
}

function fontFamilyCss(f: FontFamilyOption): string {
  switch (f) {
    case 'lexend':  return "'Lexend', 'Inter', sans-serif"
    case 'verdana': return "Verdana, Geneva, sans-serif"
    case 'tahoma':  return "Tahoma, Geneva, sans-serif"
    case 'arial':   return "Arial, Helvetica, sans-serif"
    case 'serif':   return "Georgia, 'Times New Roman', serif"
    default:        return "'Inter', sans-serif"
  }
}
