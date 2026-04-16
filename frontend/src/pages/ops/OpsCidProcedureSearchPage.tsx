import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { sigtapSearchApi, type CidProcedimentoItem } from '../../api/sigtap-search'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

const PAGE_SIZE = 20

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

export function OpsCidProcedureSearchPage() {
  const [params] = useSearchParams()
  const cid = params.get('cid') ?? ''
  const cidDesc = params.get('desc') ?? ''

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CidProcedimentoItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, [debouncedSearch])

  const reload = useCallback(async () => {
    if (!cid) return
    setLoading(true)
    try {
      const res = await sigtapSearchApi.cidProcedimentos({
        codigoCid: cid,
        search: debouncedSearch || undefined,
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
  }, [cid, debouncedSearch, page])

  useEffect(() => { void reload() }, [reload])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-5">
      <PageHeader
        title={`CID ${cid} — Procedimentos`}
        subtitle={cidDesc ? `${cidDesc} · ${total.toLocaleString('pt-BR')} procedimentos compatíveis` : `${total.toLocaleString('pt-BR')} procedimentos compatíveis`}
        back="/ops/pesquisas/cid"
      />

      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-4">
        <p className="text-sm text-red-800 dark:text-red-200">
          Mostrando procedimentos compatíveis com o diagnóstico <strong>{cid}</strong> conforme o SIGTAP vigente.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Filtrar procedimentos por nome..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={13} /></button>}
        </div>
      </div>

      {loading ? <LoadingBox /> : items.length === 0 ? <EmptyBox /> : (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Código</Th>
                  <Th>Procedimento</Th>
                  <Th>Complexidade</Th>
                  <Th>Principal</Th>
                  <Th className="text-right">Valor SH</Th>
                  <Th className="text-right">Valor SA</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map(p => (
                  <tr key={p.codigoProcedimento} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3"><code className="text-xs font-mono font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded">{p.codigoProcedimento}</code></td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-sm truncate">{p.nomeProcedimento}</td>
                    <td className="px-4 py-3"><span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', complexCls(p.complexidade))}>{complexLabel(p.complexidade)}</span></td>
                    <td className="px-4 py-3">
                      {p.principal === 'S' ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">Sim</span>
                      ) : (
                        <span className="text-xs text-slate-400">Não</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">{formatBRL(p.valorSh)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">{formatBRL(p.valorSa)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatBRL(p.valorSh + p.valorSa + p.valorSp)}</td>
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider', className)}>{children}</th>
}
function LoadingBox() {
  return <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><svg className="animate-spin w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg></div>
}
function EmptyBox() {
  return <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"><Search size={28} className="mb-2 opacity-30" /><p className="text-sm">Nenhum procedimento encontrado para este CID</p></div>
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
