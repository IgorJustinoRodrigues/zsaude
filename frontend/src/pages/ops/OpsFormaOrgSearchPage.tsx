import { useCallback, useEffect, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { sigtapSearchApi, type FormaOrganizacaoItem } from '../../api/sigtap-search'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 20

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

type SortDir = 'asc' | 'desc'

export function OpsFormaOrgSearchPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<FormaOrganizacaoItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState('codigoGrupo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => { setPage(1) }, [debouncedSearch, sortField, sortDir])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sigtapSearchApi.formasOrganizacao({ search: debouncedSearch || undefined, sort: sortField, dir: sortDir, page, pageSize: PAGE_SIZE })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar', e instanceof HttpError ? e.message : '')
      setItems([]); setTotal(0)
    } finally { setLoading(false) }
  }, [debouncedSearch, sortField, sortDir, page])

  useEffect(() => { void reload() }, [reload])

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader title="Formas de Organização" subtitle={`${total.toLocaleString('pt-BR')} formas de organização`} back="/ops/pesquisas" />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar por código ou descrição..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-slate-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
        </div>
      </div>

      {loading ? <LoadingBox /> : items.length === 0 ? <EmptyBox /> : (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <SortTh field="codigoGrupo" current={sortField} dir={sortDir} onSort={toggleSort}>Grupo</SortTh>
                  <SortTh field="codigoSubgrupo" current={sortField} dir={sortDir} onSort={toggleSort}>Subgrupo</SortTh>
                  <SortTh field="codigoForma" current={sortField} dir={sortDir} onSort={toggleSort}>Forma</SortTh>
                  <SortTh field="descricao" current={sortField} dir={sortDir} onSort={toggleSort}>Descrição</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item, i) => (
                  <tr key={`${item.codigoGrupo}-${item.codigoSubgrupo}-${item.codigoForma}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3"><code className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{item.codigoGrupo}</code></td>
                    <td className="px-4 py-3"><code className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{item.codigoSubgrupo}</code></td>
                    <td className="px-4 py-3"><code className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{item.codigoForma}</code></td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.descricao}</td>
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

function SortTh({ field, current, dir, onSort, children, className }: { field: string; current: string; dir: SortDir; onSort: (f: string) => void; children: React.ReactNode; className?: string }) {
  const active = field === current
  return (
    <th className={cn('px-4 py-2.5 text-left', className)}>
      <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
        {children}
        {active ? dir === 'asc' ? <ChevronUp size={11} className="text-slate-500" /> : <ChevronDown size={11} className="text-slate-500" /> : <ChevronsUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  )
}
function Spinner() { return <svg className="animate-spin w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> }
function LoadingBox() { return <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Spinner /></div> }
function EmptyBox() { return <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Search size={28} className="mb-2 opacity-30" /><p className="text-sm">Nenhum resultado encontrado</p></div> }
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
