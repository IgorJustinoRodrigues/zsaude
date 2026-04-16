import { useCallback, useEffect, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { sigtapSearchApi, type ProcedimentoItem, type CompatibilidadeItem } from '../../api/sigtap-search'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const COMPAT_PAGE_SIZE = 20

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

const tipoLabel = (t: string) => ({ P: 'Principal', S: 'Secundário' }[t] ?? t)

export function OpsCompatibilidadeSearchPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [suggestions, setSuggestions] = useState<ProcedimentoItem[]>([])
  const [sugLoading, setSugLoading] = useState(false)
  const [selected, setSelected] = useState<ProcedimentoItem | null>(null)

  const [compatItems, setCompatItems] = useState<CompatibilidadeItem[]>([])
  const [compatTotal, setCompatTotal] = useState(0)
  const [compatPage, setCompatPage] = useState(1)
  const [compatLoading, setCompatLoading] = useState(false)

  // Autocomplete search
  useEffect(() => {
    if (!debouncedSearch || selected) { setSuggestions([]); return }
    let cancelled = false
    ;(async () => {
      setSugLoading(true)
      try {
        const res = await sigtapSearchApi.procedimentos({ search: debouncedSearch, pageSize: 5, page: 1 })
        if (!cancelled) setSuggestions(res.items)
      } catch {
        if (!cancelled) setSuggestions([])
      } finally { if (!cancelled) setSugLoading(false) }
    })()
    return () => { cancelled = true }
  }, [debouncedSearch, selected])

  // Load compatibilities
  const loadCompat = useCallback(async () => {
    if (!selected) return
    setCompatLoading(true)
    try {
      const res = await sigtapSearchApi.compatibilidades({ codigoProcedimento: selected.codigo, page: compatPage, pageSize: COMPAT_PAGE_SIZE })
      setCompatItems(res.items)
      setCompatTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar compatibilidades', e instanceof HttpError ? e.message : '')
      setCompatItems([]); setCompatTotal(0)
    } finally { setCompatLoading(false) }
  }, [selected, compatPage])

  useEffect(() => { void loadCompat() }, [loadCompat])

  const selectProcedure = (p: ProcedimentoItem) => {
    setSelected(p)
    setSearch(p.nome)
    setSuggestions([])
    setCompatPage(1)
  }

  const clearSelection = () => {
    setSelected(null)
    setSearch('')
    setSuggestions([])
    setCompatItems([])
    setCompatTotal(0)
    setCompatPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(compatTotal / COMPAT_PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader title="Compatibilidades entre Procedimentos" subtitle="Pesquise um procedimento para ver suas compatibilidades" back="/ops/pesquisas" />

      <div className="relative">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar procedimento por código ou nome..." value={search}
            onChange={e => { setSearch(e.target.value); if (selected) setSelected(null) }}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-orange-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
          {search && <button onClick={clearSelection} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
        </div>

        {!selected && debouncedSearch && (suggestions.length > 0 || sugLoading) && (
          <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden">
            {sugLoading ? (
              <div className="flex items-center justify-center py-4"><Spinner /></div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {suggestions.map(p => (
                  <li key={p.codigo}>
                    <button onClick={() => selectProcedure(p)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors">
                      <code className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded shrink-0">{p.codigo}</code>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{p.nome}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-widest">Procedimento selecionado</p>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">
            <code className="text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/40 px-1.5 py-0.5 rounded text-xs font-mono mr-2">{selected.codigo}</code>
            {selected.nome}
          </p>
        </div>
      )}

      {selected && (
        compatLoading ? <LoadingBox /> : compatItems.length === 0 ? <EmptyBox /> : (
          <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <Th>Código</Th>
                    <Th>Procedimento Compatível</Th>
                    <Th>Reg. Principal</Th>
                    <Th>Reg. Secundário</Th>
                    <Th>Tipo</Th>
                    <Th className="text-right">Qt. Permitida</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {compatItems.map((c, i) => (
                    <tr key={`${c.codigoProcedimentoSecundario}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-2.5"><code className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded">{c.codigoProcedimentoSecundario}</code></td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">{c.nomeProcedimentoSecundario}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{c.registroPrincipal}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{c.registroSecundario}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full',
                          c.tipoCompatibilidade === 'P' ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400'
                          : c.tipoCompatibilidade === 'S' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-500'
                        )}>{tipoLabel(c.tipoCompatibilidade)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{c.quantidadePermitida}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={compatPage} totalPages={totalPages} total={compatTotal} pageSize={COMPAT_PAGE_SIZE} onPage={setCompatPage} />
          </>
        )
      )}

      {!selected && !debouncedSearch && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Pesquise um procedimento acima para ver suas compatibilidades</p>
        </div>
      )}
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={cn('px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider', className)}>{children}</th> }
function Spinner() { return <svg className="animate-spin w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> }
function LoadingBox() { return <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Spinner /></div> }
function EmptyBox() { return <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Search size={28} className="mb-2 opacity-30" /><p className="text-sm">Nenhuma compatibilidade encontrada</p></div> }
function Pagination({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
      <span>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} de {total.toLocaleString('pt-BR')}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><ChevronLeft size={13} /></button>
        <span className="px-2 text-slate-400">{page} / {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><ChevronRight size={13} /></button>
      </div>
    </div>
  )
}
