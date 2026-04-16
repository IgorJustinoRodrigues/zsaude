import { useCallback, useEffect, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight, Filter, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { sigtapSearchApi, type ProcedimentoItem } from '../../api/sigtap-search'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 20

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

const COMPLEX_OPTS = [
  { value: '', label: 'Todas' },
  { value: '1', label: 'At. Básica' },
  { value: '2', label: 'Média' },
  { value: '3', label: 'Alta' },
]
const SEXO_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
  { value: 'I', label: 'Indiferente' },
]

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const complexLabel = (c: string) => ({ '1': 'Básica', '2': 'Média', '3': 'Alta' }[c] ?? (c || '—'))
const complexCls = (c: string) => ({
  '1': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  '2': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  '3': 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
}[c] ?? 'bg-slate-100 text-slate-500')

export function OpsProcedureSearchPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [complexidade, setComplexidade] = useState('')
  const [sexo, setSexo] = useState('')
  const [revogado, setRevogado] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ProcedimentoItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'codigo' | 'nome' | 'complexidade' | 'valorTotal'>('codigo')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => { setPage(1) }, [debouncedSearch, complexidade, sexo, revogado, sortField, sortDir])

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'valorTotal' ? 'desc' : 'asc') }
  }

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sigtapSearchApi.procedimentos({
        search: debouncedSearch || undefined,
        complexidade: complexidade || undefined,
        sexo: sexo || undefined,
        revogado,
        sort: sortField, dir: sortDir,
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
  }, [debouncedSearch, complexidade, sexo, revogado, sortField, sortDir, page])

  useEffect(() => { void reload() }, [reload])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilter = !!complexidade || !!sexo || revogado

  return (
    <div className="space-y-5">
      <PageHeader title="Pesquisa de Procedimentos" subtitle={`${total.toLocaleString('pt-BR')} procedimentos · SIGTAP`} back="/ops/pesquisas" />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar por código ou nome do procedimento..." value={search} onChange={e => setSearch(e.target.value)}
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
          {hasFilter && <span className="w-4 h-4 text-[9px] font-bold rounded-full bg-sky-500 text-white flex items-center justify-center">{(complexidade ? 1 : 0) + (sexo ? 1 : 0) + (revogado ? 1 : 0)}</span>}
        </button>
      </div>

      {showFilter && (
        <div className="flex flex-wrap gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <FilterGroup label="Complexidade" options={COMPLEX_OPTS} value={complexidade} onChange={setComplexidade} />
          <FilterGroup label="Sexo" options={SEXO_OPTS} value={sexo} onChange={setSexo} />
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Revogados</label>
            <div className="flex gap-1">
              <button onClick={() => setRevogado(false)} className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', !revogado ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200')}>Ativos</button>
              <button onClick={() => setRevogado(true)} className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', revogado ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200')}>Revogados</button>
            </div>
          </div>
          {hasFilter && <button onClick={() => { setComplexidade(''); setSexo(''); setRevogado(false) }} className="self-end text-xs text-slate-400 hover:text-slate-600 underline">Limpar</button>}
        </div>
      )}

      {loading ? <LoadingBox /> : items.length === 0 ? <EmptyBox /> : (
        <>
          <div className="flex items-center gap-1 px-1 mb-1">
            <span className="text-[10px] text-slate-400 mr-2">Ordenar por:</span>
            <SortBtn field="codigo" label="Código" current={sortField} dir={sortDir} onSort={toggleSort} />
            <SortBtn field="nome" label="Nome" current={sortField} dir={sortDir} onSort={toggleSort} />
            <SortBtn field="complexidade" label="Complexidade" current={sortField} dir={sortDir} onSort={toggleSort} />
            <SortBtn field="valorTotal" label="Valor total" current={sortField} dir={sortDir} onSort={toggleSort} />
          </div>
          <div className="space-y-2">
            {items.map(p => {
              const expanded = expandedId === p.codigo
              return (
                <div key={p.codigo} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedId(expanded ? null : p.codigo)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <code className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded shrink-0">{p.codigo}</code>
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">{p.nome}</span>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', complexCls(p.complexidade))}>{complexLabel(p.complexidade)}</span>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0">{formatBRL(p.valorSh + p.valorSa + p.valorSp)}</span>
                    {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <Detail label="Valor SH" value={formatBRL(p.valorSh)} />
                        <Detail label="Valor SA" value={formatBRL(p.valorSa)} />
                        <Detail label="Valor SP" value={formatBRL(p.valorSp)} />
                        <Detail label="Total" value={formatBRL(p.valorSh + p.valorSa + p.valorSp)} accent />
                        <Detail label="Sexo" value={{ M: 'Masculino', F: 'Feminino', I: 'Indiferente' }[p.sexo] ?? p.sexo} />
                        <Detail label="Idade" value={`${p.idadeMinima} – ${p.idadeMaxima} meses`} />
                        <Detail label="Qt. Máxima" value={String(p.qtMaxima)} />
                        <Detail label="Qt. Dias" value={String(p.qtDias)} />
                        <Detail label="Pontos" value={String(p.qtPontos)} />
                        <Detail label="Financiamento" value={p.idFinanciamento} />
                        <Detail label="Competência" value={p.competencia} />
                        <Detail label="Status" value={p.revogado ? 'Revogado' : 'Ativo'} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  )
}

function SortBtn({ field, label, current, dir, onSort }: { field: string; label: string; current: string; dir: 'asc' | 'desc'; onSort: (f: any) => void }) {
  const active = field === current
  return (
    <button onClick={() => onSort(field)} className={cn(
      'inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
      active ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200',
    )}>
      {label}
      {active ? dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} /> : <ChevronsUpDown size={10} className="opacity-40" />}
    </button>
  )
}

function Detail({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={cn('mt-0.5 font-medium', accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300')}>{value}</p>
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
