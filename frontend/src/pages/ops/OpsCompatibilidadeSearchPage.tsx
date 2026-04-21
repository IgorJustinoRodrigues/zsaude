import { useCallback, useEffect, useState } from 'react'
import { Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Link2 } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { sigtapSearchApi, type ProcedimentoComCompatItem, type CompatibilidadeItem } from '../../api/sigtap-search'
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

const complexLabel = (c: string) => ({ '1': 'Básica', '2': 'Média', '3': 'Alta' }[c] ?? (c || '—'))
const complexCls = (c: string) => ({
  '1': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  '2': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  '3': 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
}[c] ?? 'bg-slate-100 text-slate-500')

const tipoLabel = (t: string) => ({
  '1': 'Compatível', '2': 'Incompatível', '3': 'Principal/Secundário',
  P: 'Principal', S: 'Secundário',
}[t] ?? (t || '—'))
const tipoCls = (t: string) => ({
  '1': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  '2': 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  '3': 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  P: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  S: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
}[t] ?? 'bg-slate-100 text-slate-500')

type SortDir = 'asc' | 'desc'

export function OpsCompatibilidadeSearchPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ProcedimentoComCompatItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalProc, setModalProc] = useState<ProcedimentoComCompatItem | null>(null)
  const [sortField, setSortField] = useState<'codigo' | 'nome' | 'complexidade' | 'totalCompatibilidades'>('totalCompatibilidades')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => { setPage(1) }, [debouncedSearch, sortField, sortDir])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sigtapSearchApi.procedimentosComCompatibilidades({
        search: debouncedSearch || undefined,
        sort: sortField, dir: sortDir,
        page, pageSize: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar', e instanceof HttpError ? e.message : '')
      setItems([]); setTotal(0)
    } finally { setLoading(false) }
  }, [debouncedSearch, sortField, sortDir, page])

  useEffect(() => { void reload() }, [reload])

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'totalCompatibilidades' ? 'desc' : 'asc') }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compatibilidades entre Procedimentos"
        subtitle={`${total.toLocaleString('pt-BR')} procedimentos com compatibilidades · selecione um para ver as regras`}
        back="/ops/pesquisas"
      />

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar procedimento por código ou nome..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-orange-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
        </div>
      </div>

      {loading ? <LoadingBox /> : items.length === 0 ? <EmptyBox /> : (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <SortTh field="codigo" current={sortField} dir={sortDir} onSort={toggleSort}>Código</SortTh>
                  <SortTh field="nome" current={sortField} dir={sortDir} onSort={toggleSort}>Procedimento</SortTh>
                  <SortTh field="complexidade" current={sortField} dir={sortDir} onSort={toggleSort}>Complexidade</SortTh>
                  <SortTh field="totalCompatibilidades" current={sortField} dir={sortDir} onSort={toggleSort} className="text-center">Compatibilidades</SortTh>
                  <th className="px-4 py-2.5 text-right"><span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(p => (
                  <tr key={p.codigo} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3"><code className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded">{p.codigo}</code></td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-md truncate">{p.nome}</td>
                    <td className="px-4 py-3"><span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', complexCls(p.complexidade))}>{complexLabel(p.complexidade)}</span></td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full tabular-nums">
                        {p.totalCompatibilidades.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setModalProc(p)} className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-200 font-medium">
                        <Link2 size={12} /> Ver compatibilidades
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

      {modalProc && <CompatibilidadesModal proc={modalProc} onClose={() => setModalProc(null)} />}
    </div>
  )
}

// ─── Modal de compatibilidades ──────────────────────────────────────────────

function CompatibilidadesModal({ proc, onClose }: { proc: ProcedimentoComCompatItem; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CompatibilidadeItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, [debouncedSearch])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await sigtapSearchApi.compatibilidades({
        codigoProcedimento: proc.codigo,
        search: debouncedSearch || undefined,
        page, pageSize: MODAL_PAGE_SIZE,
      })
      setItems(res.items); setTotal(res.total)
    } catch (e) {
      toast.error('Falha ao carregar compatibilidades', e instanceof HttpError ? e.message : '')
      setItems([]); setTotal(0)
    } finally { setLoading(false) }
  }, [proc.codigo, debouncedSearch, page])

  useEffect(() => { void reload() }, [reload])

  const totalPages = Math.max(1, Math.ceil(total / MODAL_PAGE_SIZE))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Compatibilidades de</p>
              <h2 className="text-base font-semibold mt-0.5">
                <code className="text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded text-sm font-mono mr-2">{proc.codigo}</code>
                {proc.nome}
              </h2>
              <p className="text-xs text-slate-500 mt-1">{total.toLocaleString('pt-BR')} procedimentos relacionados</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"><X size={16} /></button>
          </div>
          <div className="relative mt-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Filtrar por nome do procedimento compatível..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-orange-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="flex items-center justify-center py-12"><Spinner /></div>
          : items.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-slate-400"><Search size={24} className="mb-2 opacity-30" /><p className="text-sm">Nenhum procedimento compatível encontrado</p></div>
          : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 backdrop-blur-sm">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <Th>Código</Th>
                  <Th>Procedimento</Th>
                  <Th>Reg. Pr.</Th>
                  <Th>Reg. Sec.</Th>
                  <Th>Tipo</Th>
                  <Th className="text-right">Qt. Permitida</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((c, i) => (
                  <tr key={`${c.codigoProcedimentoSecundario}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5"><code className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded">{c.codigoProcedimentoSecundario}</code></td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">{c.nomeProcedimentoSecundario}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{c.registroPrincipal}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{c.registroSecundario}</td>
                    <td className="px-4 py-2.5"><span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', tipoCls(c.tipoCompatibilidade))}>{tipoLabel(c.tipoCompatibilidade)}</span></td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{c.quantidadePermitida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {total > MODAL_PAGE_SIZE && <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0"><Pagination page={page} totalPages={totalPages} total={total} pageSize={MODAL_PAGE_SIZE} onPage={setPage} /></div>}
      </div>
    </div>
  )
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function SortTh({ field, current, dir, onSort, children, className }: { field: string; current: string; dir: SortDir; onSort: (f: any) => void; children: React.ReactNode; className?: string }) {
  const active = field === current
  return (
    <th className={cn('px-4 py-2.5 text-left', className)}>
      <button onClick={() => onSort(field)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
        {children}
        {active ? dir === 'asc' ? <ChevronUp size={11} className="text-orange-500" /> : <ChevronDown size={11} className="text-orange-500" /> : <ChevronsUpDown size={11} className="opacity-40" />}
      </button>
    </th>
  )
}
function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={cn('px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider', className)}>{children}</th> }
function Spinner() { return <svg className="animate-spin w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> }
function LoadingBox() { return <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Spinner /></div> }
function EmptyBox() { return <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Search size={28} className="mb-2 opacity-30" /><p className="text-sm">Nenhum procedimento encontrado</p></div> }
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
