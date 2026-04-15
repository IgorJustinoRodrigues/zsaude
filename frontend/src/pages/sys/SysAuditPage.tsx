import { useEffect, useState, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { sysApi, type AuditLogItem } from '../../api/sys'
import { HttpError } from '../../api/client'
import { cn } from '../../lib/utils'

const SEV_STYLE: Record<string, string> = {
  info:     'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  warning:  'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  error:    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
}

function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR')
}

export function SysAuditPage() {
  const [items, setItems] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage]   = useState(1)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'all' | 'master'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AuditLogItem | null>(null)

  const PAGE_SIZE = 20
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(() => {
    setLoading(true); setError('')
    sysApi.listAudit({
      page, pageSize: PAGE_SIZE,
      search: search || undefined,
      scope: scope === 'master' ? 'master' : undefined,
    })
      .then(r => { setItems(r.items); setTotal(r.total) })
      .catch(e => setError(e instanceof HttpError ? e.message : 'Erro ao carregar logs.'))
      .finally(() => setLoading(false))
  }, [page, search, scope])

  useEffect(load, [load])

  useEffect(() => { setPage(1) }, [search, scope])

  return (
    <>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ScrollText size={20} className="text-violet-500" />
            Logs do sistema
          </h1>
          <p className="text-sm text-slate-500 mt-1">Auditoria completa — {total} eventos</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por usuário, descrição, IP..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-800 dark:text-slate-200" />
          </div>
          <div className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
            <button onClick={() => setScope('all')}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                scope === 'all' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}>
              Todos
            </button>
            <button onClick={() => setScope('master')}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                scope === 'master' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')}>
              Somente MASTER
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-400">
            <ScrollText size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum evento registrado.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map(l => (
                <button key={l.id} onClick={() => setSelected(l)}
                  className="w-full flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-widest', SEV_STYLE[l.severity] ?? SEV_STYLE.info)}>
                        {l.severity}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {l.module}
                      </span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{l.action}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 truncate">{l.description}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{l.userName} · {l.ip} · {fmt(l.at)}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
              <span>{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <ChevronLeft size={13} />
                </button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal detalhe */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{selected.module} · {selected.action}</p>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{selected.description}</h2>
            </div>
            <div className="p-5 space-y-3 text-xs overflow-y-auto">
              <DetailRow label="Usuário"  value={selected.userName} />
              <DetailRow label="Papel"    value={selected.role || '—'} />
              <DetailRow label="IP"       value={selected.ip || '—'} />
              <DetailRow label="Data"     value={fmt(selected.at)} />
              <DetailRow label="Recurso"  value={selected.resource ? `${selected.resource}${selected.resourceId ? ' · ' + selected.resourceId : ''}` : '—'} />
              <DetailRow label="Request"  value={selected.requestId || '—'} mono />
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Detalhes</p>
                <pre className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 overflow-auto text-[11px] font-mono text-slate-700 dark:text-slate-200">
{JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={cn('text-sm text-slate-700 dark:text-slate-200 break-all', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  )
}
