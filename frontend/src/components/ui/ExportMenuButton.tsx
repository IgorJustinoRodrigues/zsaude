import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, FileStack } from 'lucide-react'
import { cn } from '../../lib/utils'
import { exportData, type ExportOptions } from '../../lib/export'

interface Props<T> {
  /** Opções de export compartilhadas entre CSV e PDF. */
  options: ExportOptions<T>
  /** Label do botão. Default "Exportar". */
  label?: string
  /** Desabilita quando não há dados (``rows.length === 0``). Default true. */
  disableWhenEmpty?: boolean
  /**
   * Orientação do PDF a oferecer. **Por design, cada tela escolhe uma
   * orientação** (ou oculta o PDF passando ``'none'``). Default:
   * ``'portrait'`` — a orientação comum do sistema.
   * Use ``'landscape'`` quando a tabela tem muitas colunas / texto longo.
   */
  pdfOrientation?: 'portrait' | 'landscape' | 'none'
  /** Classes extras no botão principal (tamanho/padding customizado). */
  className?: string
}

/**
 * Dropdown padrão pra exportar uma listagem em CSV ou PDF.
 *
 * Plug and play: passe as ``options`` que você passaria pro ``exportData``
 * e o botão aparece com 2-3 opções no menu.
 */
export function ExportMenuButton<T>({
  options,
  label = 'Exportar',
  disableWhenEmpty = true,
  pdfOrientation = 'portrait',
  className,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const disabled = disableWhenEmpty && options.rows.length === 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
          className,
        )}
      >
        <Download size={14} />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 overflow-hidden">
          <MenuItem
            icon={<FileSpreadsheet size={14} className="text-emerald-600" />}
            label="Planilha (CSV)"
            hint=".csv"
            onClick={() => { exportData('csv', options); setOpen(false) }}
          />
          {pdfOrientation === 'portrait' && (
            <MenuItem
              icon={<FileText size={14} className="text-rose-600" />}
              label="Documento (PDF)"
              hint=".pdf"
              onClick={() => { exportData('pdf-portrait', options); setOpen(false) }}
            />
          )}
          {pdfOrientation === 'landscape' && (
            <MenuItem
              icon={<FileStack size={14} className="text-rose-600" />}
              label="Documento (PDF)"
              hint=".pdf"
              onClick={() => { exportData('pdf-landscape', options); setOpen(false) }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon, label, hint, onClick,
}: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-t border-slate-100 dark:border-slate-800 first:border-t-0"
    >
      {icon}
      <span className="flex-1">{label}</span>
      <span className="text-[10px] text-slate-400">{hint}</span>
    </button>
  )
}
