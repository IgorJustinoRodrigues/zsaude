import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ChevronLeft, ChevronRight, Filter, Stethoscope } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { sigtapSearchApi, type CidItem } from '../../api/sigtap-search'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 20

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

const SEXO_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
  { value: 'I', label: 'Indiferente' },
]
const AGRAVO_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'S', label: 'Sim' },
  { value: 'N', label: 'Não' },
]

export function OpsCidSearchPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [sexo, setSexo] = useState('')
  const [agravo, setAgravo] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CidItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, [debouncedSearch, sexo, agravo])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sigtapSearchApi.cids({
        search: debouncedSearch || undefined,
        sexo: sexo || undefined,
        agravo: agravo || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar', e instanceof HttpError ? e.message : '')
      setItems([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, sexo, agravo, page])

  useEffect(() => { void reload() }, [reload])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilter = !!sexo || !!agravo

  const sexoLabel = (v: string) => ({ M: 'Masc', F: 'Fem', I: 'Ind', N: '—' }[v] ?? (v || '—'))
  const agravoLabel = (v: string) => v === 'S' ? 'Sim' : v === 'N' ? 'Não' : '—'

  return (
    <div className="space-y-5">
      <PageHeader title="Pesquisa CID" subtitle={`${total.toLocaleString('pt-BR')} diagnósticos encontrados`} back="/ops/pesquisas" />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar por código ou descrição..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
        </div>
        <button onClick={() => setShowFilter(f => !f)} className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shrink-0',
          showFilter || hasFilter
            ? 'border-sky-400 text-sky-600 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-400'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-slate-300',
        )}>
          <Filter size={13} /> Filtros
          {hasFilter && <span className="w-4 h-4 text-[9px] font-bold rounded-full bg-sky-500 text-white flex items-center justify-center">{(sexo ? 1 : 0) + (agravo ? 1 : 0)}</span>}
        </button>
      </div>

      {showFilter && (
        <div className="flex flex-wrap gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <FilterGroup label="Sexo" options={SEXO_OPTS} value={sexo} onChange={setSexo} />
          <FilterGroup label="Agravo" options={AGRAVO_OPTS} value={agravo} onChange={setAgravo} />
          {hasFilter && <button onClick={() => { setSexo(''); setAgravo('') }} className="self-end text-xs text-slate-400 hover:text-slate-600 underline">Limpar</button>}
        </div>
      )}

      {loading ? <LoadingBox /> : items.length === 0 ? <EmptyBox /> : (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Código</Th>
                  <Th>Descrição</Th>
                  <Th>Sexo</Th>
                  <Th>Agravo</Th>
                  <th className="px-4 py-2.5 text-right"><span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(item => (
                  <tr key={item.codigo} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3"><code className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded">{item.codigo}</code></td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-md truncate">{item.descricao}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{sexoLabel(item.sexo)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{agravoLabel(item.agravo)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => navigate(`/ops/pesquisas/cid-procedimentos?cid=${item.codigo}&desc=${encodeURIComponent(item.descricao)}`)}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 font-medium">
                        <Stethoscope size={12} /> Procedimentos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  )
}

function FilterGroup({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
      <div className="flex gap-1">
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)} className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            value === o.value ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200',
          )}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</th>
}
function LoadingBox() {
  return <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><svg className="animate-spin w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg></div>
}
function EmptyBox() {
  return <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Search size={28} className="mb-2 opacity-30" /><p className="text-sm">Nenhum resultado encontrado</p></div>
}
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
