import { useCallback, useEffect, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Filter, Stethoscope } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { sigtapSearchApi, type CidItem, type CidProcedimentoItem } from '../../api/sigtap-search'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 20
const MODAL_PAGE_SIZE = 15

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const complexLabel = (c: string) => ({ '1': 'Básica', '2': 'Média', '3': 'Alta' }[c] ?? (c || '—'))
const complexCls = (c: string) => ({
  '1': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  '2': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  '3': 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
}[c] ?? 'bg-slate-100 text-slate-500')

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

type SortDir = 'asc' | 'desc'
type CidSortField = 'codigo' | 'descricao' | 'sexo' | 'agravo' | 'totalProcedimentos'

export function OpsCidSearchPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [sexo, setSexo] = useState('')
  const [agravo, setAgravo] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CidItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalCid, setModalCid] = useState<CidItem | null>(null)
  const [sortField, setSortField] = useState<CidSortField>('codigo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => { setPage(1) }, [debouncedSearch, sexo, agravo, sortField, sortDir])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sigtapSearchApi.cids({
        search: debouncedSearch || undefined,
        sexo: sexo || undefined,
        agravo: agravo || undefined,
        sort: sortField, dir: sortDir,
        page, pageSize: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar', e instanceof HttpError ? e.message : '')
      setItems([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, sexo, agravo, sortField, sortDir, page])

  useEffect(() => { void reload() }, [reload])

  const toggleSort = (field: CidSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'totalProcedimentos' ? 'desc' : 'asc') }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilter = !!sexo || !!agravo
  const sexoLabel = (v: string) => ({ M: 'Masc', F: 'Fem', I: 'Ind', N: '—' }[v] ?? (v || '—'))
  const agravoLabel = (v: string) => v === 'S' ? 'Sim' : v === 'N' ? 'Não' : '—'

  return (
    <div className="space-y-5">
      <PageHeader title="CID × Procedimentos" subtitle={`${total.toLocaleString('pt-BR')} diagnósticos · selecione um para ver os procedimentos`} back="/ops/pesquisas" />

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
                  <SortTh field="codigo" current={sortField} dir={sortDir} onSort={toggleSort}>Código</SortTh>
                  <SortTh field="descricao" current={sortField} dir={sortDir} onSort={toggleSort}>Descrição</SortTh>
                  <SortTh field="sexo" current={sortField} dir={sortDir} onSort={toggleSort}>Sexo</SortTh>
                  <SortTh field="agravo" current={sortField} dir={sortDir} onSort={toggleSort}>Agravo</SortTh>
                  <SortTh field="totalProcedimentos" current={sortField} dir={sortDir} onSort={toggleSort} className="text-center">Procedimentos</SortTh>
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
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full tabular-nums">
                        {item.totalProcedimentos.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setModalCid(item)}
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

      {modalCid && <ProcedimentosModal cid={modalCid} onClose={() => setModalCid(null)} />}
    </div>
  )
}

// ─── Modal de procedimentos ──────────────────────────────────────────────────

function ProcedimentosModal({ cid, onClose }: { cid: CidItem; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CidProcedimentoItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, [debouncedSearch])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sigtapSearchApi.cidProcedimentos({ codigoCid: cid.codigo, search: debouncedSearch || undefined, page, pageSize: MODAL_PAGE_SIZE })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar procedimentos', e instanceof HttpError ? e.message : '')
      setItems([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [cid.codigo, debouncedSearch, page])

  useEffect(() => { void reload() }, [reload])

  const totalPages = Math.max(1, Math.ceil(total / MODAL_PAGE_SIZE))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Procedimentos compatíveis</p>
              <h2 className="text-base font-semibold mt-0.5">
                <code className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded text-sm font-mono mr-2">{cid.codigo}</code>
                {cid.descricao}
              </h2>
              <p className="text-xs text-slate-500 mt-1">{total.toLocaleString('pt-BR')} procedimentos</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><X size={16} /></button>
          </div>
          <div className="relative mt-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Filtrar procedimentos..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><svg className="animate-spin w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400"><Search size={24} className="mb-2 opacity-30" /><p className="text-sm">Nenhum procedimento encontrado</p></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 backdrop-blur-sm">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <StaticTh>Código</StaticTh>
                  <StaticTh>Procedimento</StaticTh>
                  <StaticTh>Compl.</StaticTh>
                  <StaticTh>Principal</StaticTh>
                  <StaticTh className="text-right">Valor SH</StaticTh>
                  <StaticTh className="text-right">Total</StaticTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(p => (
                  <tr key={p.codigoProcedimento} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5"><code className="text-xs font-mono font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">{p.codigoProcedimento}</code></td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">{p.nomeProcedimento}</td>
                    <td className="px-4 py-2.5"><span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', complexCls(p.complexidade))}>{complexLabel(p.complexidade)}</span></td>
                    <td className="px-4 py-2.5">
                      {p.principal === 'S'
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">Sim</span>
                        : <span className="text-xs text-slate-400">Não</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500 tabular-nums">{formatBRL(p.valorSh)}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatBRL(p.valorSh + p.valorSa + p.valorSp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {total > MODAL_PAGE_SIZE && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={MODAL_PAGE_SIZE} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function SortTh<F extends string>({ field, current, dir, onSort, children, className }: {
  field: F; current: F; dir: SortDir; onSort: (f: F) => void; children: React.ReactNode; className?: string
}) {
  const active = field === current
  return (
    <th className={cn('px-4 py-2.5 text-left', className)}>
      <button onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
        {children}
        {active
          ? dir === 'asc' ? <ChevronUp size={11} className="text-sky-500" /> : <ChevronDown size={11} className="text-sky-500" />
          : <ChevronsUpDown size={11} className="opacity-40" />}
      </button>
    </th>
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

function StaticTh({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider', className)}>{children}</th>
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
