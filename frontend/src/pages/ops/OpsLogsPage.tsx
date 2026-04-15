import { useCallback, useEffect, useState } from 'react'
import {
  Search, X, Filter, Eye,
  LogIn, LogOut, AlertTriangle,
  FilePlus, FileEdit, Trash2, Download, Printer,
  ShieldAlert, KeyRound, ShieldOff,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { auditApi, type AuditLogItem } from '../../api/audit'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { AuditDetails } from '../../components/shared/AuditDetails'

// ─── Meta ─────────────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; icon: React.ReactNode }> = {
  login:             { label: 'Login',           icon: <LogIn size={12} /> },
  logout:            { label: 'Saída',          icon: <LogOut size={12} /> },
  login_failed:      { label: 'Falha de entrada',    icon: <AlertTriangle size={12} /> },
  view:              { label: 'Visualização',    icon: <Eye size={12} /> },
  create:            { label: 'Criação',         icon: <FilePlus size={12} /> },
  edit:              { label: 'Edição',          icon: <FileEdit size={12} /> },
  delete:            { label: 'Exclusão',        icon: <Trash2 size={12} /> },
  export:            { label: 'Exportação',      icon: <Download size={12} /> },
  print:             { label: 'Impressão',       icon: <Printer size={12} /> },
  permission_change: { label: 'Permissão',       icon: <ShieldAlert size={12} /> },
  password_reset:    { label: 'Reset de senha',  icon: <KeyRound size={12} /> },
  block_user:        { label: 'Bloqueio',        icon: <ShieldOff size={12} /> },
}

const SEVERITY_STYLE: Record<string, string> = {
  info:     'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  warning:  'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  error:    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 font-semibold',
}

const SEVERITY_LABEL: Record<string, string> = {
  info: 'Info', warning: 'Aviso', error: 'Erro', critical: 'Crítico',
}

const ACTION_COLOR: Record<string, string> = {
  login:             'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
  logout:            'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
  login_failed:      'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40',
  view:              'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40',
  create:            'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40',
  edit:              'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
  delete:            'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40',
  export:            'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40',
  print:             'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800',
  permission_change: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40',
  password_reset:    'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40',
  block_user:        'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60',
}

const MODULE_COLOR: Record<string, string> = {
  CLN: '#0ea5e9', DGN: '#8b5cf6', HSP: '#f59e0b',
  PLN: '#10b981', FSC: '#f97316', OPS: '#6b7280',
  SYS: '#8b5cf6', AUTH: '#0ea5e9', API: '#64748b',
}

const ALL_MODULES = ['SYS', 'AUTH', 'CLN', 'DGN', 'HSP', 'PLN', 'FSC', 'OPS']
const ALL_ACTIONS = Object.keys(ACTION_META)
const ALL_SEVERITIES = ['info', 'warning', 'error', 'critical']
const PAGE_SIZE = 20

function fmtDateTime(d: string) {
  const date = new Date(d)
  return date.toLocaleDateString('pt-BR') + ' · ' +
    date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OpsLogsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [filterModule, setFilterModule] = useState<string>('Todos')
  const [filterAction, setFilterAction] = useState<string>('Todos')
  const [filterSeverity, setFilterSeverity] = useState<string>('Todos')
  const [showFilter, setShowFilter] = useState(false)
  const [selected, setSelected] = useState<AuditLogItem | null>(null)
  const [page, setPage] = useState(1)

  const [items, setItems] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(1) }, [debouncedSearch, filterModule, filterAction, filterSeverity])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await auditApi.list({
        search: debouncedSearch || undefined,
        module: filterModule !== 'Todos' ? filterModule : undefined,
        action: filterAction !== 'Todos' ? filterAction : undefined,
        severity: filterSeverity !== 'Todos' ? filterSeverity : undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      toast.error(
        'Falha ao carregar logs',
        e instanceof HttpError ? e.message : 'Tente novamente.',
      )
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, filterModule, filterAction, filterSeverity, page])

  useEffect(() => { void load() }, [load])

  const hasFilter = filterModule !== 'Todos' || filterAction !== 'Todos' || filterSeverity !== 'Todos'
  const filterCount = [filterModule !== 'Todos', filterAction !== 'Todos', filterSeverity !== 'Todos'].filter(Boolean).length

  const clearFilters = () => {
    setFilterModule('Todos'); setFilterAction('Todos'); setFilterSeverity('Todos')
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Logs do sistema</h1>
        <p className="text-sm text-slate-500 mt-0.5">Auditoria completa de ações realizadas no sistema</p>
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por usuário, descrição ou IP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X size={13} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilter(f => !f)}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors shrink-0',
            showFilter || hasFilter
              ? 'border-sky-400 text-sky-600 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-700'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-slate-300',
          )}
        >
          <Filter size={13} />
          Filtros
          {hasFilter && (
            <span className="w-4 h-4 text-[9px] font-bold rounded-full bg-sky-500 text-white flex items-center justify-center">
              {filterCount}
            </span>
          )}
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilter && (
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <FilterGroup label="Módulo">
            {['Todos', ...ALL_MODULES].map(m => (
              <Pill key={m} active={filterModule === m} onClick={() => setFilterModule(m)}>{m}</Pill>
            ))}
          </FilterGroup>
          <FilterGroup label="Severidade">
            {['Todos', ...ALL_SEVERITIES].map(s => (
              <Pill key={s} active={filterSeverity === s} onClick={() => setFilterSeverity(s)}>
                {s === 'Todos' ? 'Todos' : SEVERITY_LABEL[s]}
              </Pill>
            ))}
          </FilterGroup>
          <FilterGroup label="Ação">
            <Pill active={filterAction === 'Todos'} onClick={() => setFilterAction('Todos')}>Todas</Pill>
            {ALL_ACTIONS.map(a => (
              <Pill key={a} active={filterAction === a} onClick={() => setFilterAction(a)}>
                {ACTION_META[a].label}
              </Pill>
            ))}
          </FilterGroup>
          {hasFilter && (
            <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-3">
              <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <svg className="animate-spin w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum log encontrado</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm hidden lg:table">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <Th>Data / Hora</Th>
                <Th>Usuário</Th>
                <Th>Ação</Th>
                <Th>Recurso</Th>
                <Th>Módulo</Th>
                <Th>Severidade</Th>
                <th className="px-4 py-2.5 text-right">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map(log => (
                <LogRow key={log.id} log={log} onView={() => setSelected(log)} />
              ))}
            </tbody>
          </table>

          <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {items.map(log => (
              <MobileLogCard key={log.id} log={log} onView={() => setSelected(log)} />
            ))}
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 text-xs text-slate-500">
            <span>
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="px-2 text-slate-400">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {selected && <LogDetailModal log={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function LogDetailModal({ log, onClose }: { log: AuditLogItem; onClose: () => void }) {
  const actMeta = ACTION_META[log.action] ?? { label: log.action, icon: null }
  const modColor = MODULE_COLOR[log.module] ?? '#6b7280'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', ACTION_COLOR[log.action] ?? 'bg-slate-100 text-slate-500')}>
              {actMeta.icon}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{actMeta.label}</h2>
              <p className="text-[11px] text-slate-400">{log.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', SEVERITY_STYLE[log.severity] ?? '')}>
              {SEVERITY_LABEL[log.severity] ?? log.severity}
            </span>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: modColor + '1a', color: modColor }}
            >
              {log.module}
            </span>
          </div>

          <Section title="Identificação">
            <Row label="ID"           value={log.id} mono />
            <Row label="Data e hora"  value={fmtDateTime(log.at)} />
            <Row label="Recurso"      value={log.resource ? `${log.resource}${log.resourceId ? ' · ' + log.resourceId : ''}` : '—'} mono />
            <Row label="Request ID"   value={log.requestId || '—'} mono />
          </Section>

          <Section title="Usuário">
            <Row label="Nome"      value={log.userName || '—'} />
            <Row label="ID"        value={log.userId || '—'} mono />
            <Row label="Papel"     value={log.role || '—'} />
            <Row label="IP"        value={log.ip || '—'} mono />
            <Row label="User-Agent" value={log.userAgent || '—'} mono small />
          </Section>

          {Object.keys(log.details).length > 0 && (
            <Section title="Detalhes">
              <AuditDetails details={log.details} />
            </Section>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
        active
          ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
      )}
    >
      {children}
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</span>
    </th>
  )
}

function LogRow({ log, onView }: { log: AuditLogItem; onView: () => void }) {
  const actMeta = ACTION_META[log.action] ?? { label: log.action, icon: null }
  const modColor = MODULE_COLOR[log.module] ?? '#6b7280'
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-xs text-slate-700 dark:text-slate-200">{fmtDateTime(log.at)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{log.userName || '—'}</p>
        <p className="text-[10px] font-mono text-slate-400">{log.ip || '—'}</p>
      </td>
      <td className="px-4 py-3">
        <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium', ACTION_COLOR[log.action] ?? 'bg-slate-100 text-slate-500')}>
          {actMeta.icon}
          {actMeta.label}
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]">{log.description}</p>
        <p className="text-[10px] text-slate-400 font-mono">{log.resource}</p>
      </td>
      <td className="px-4 py-3">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: modColor + '1a', color: modColor }}>
          {log.module}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-xs px-2 py-0.5 rounded-full', SEVERITY_STYLE[log.severity] ?? '')}>
          {SEVERITY_LABEL[log.severity] ?? log.severity}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={onView} title="Ver detalhes" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Eye size={14} />
        </button>
      </td>
    </tr>
  )
}

function MobileLogCard({ log, onView }: { log: AuditLogItem; onView: () => void }) {
  const actMeta = ACTION_META[log.action] ?? { label: log.action, icon: null }
  const modColor = MODULE_COLOR[log.module] ?? '#6b7280'
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5', ACTION_COLOR[log.action] ?? 'bg-slate-100 text-slate-500')}>
            {actMeta.icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{log.description}</p>
            <p className="text-xs text-slate-400 mt-0.5">{log.userName || '—'} · {log.ip || '—'}</p>
          </div>
        </div>
        <button onClick={onView} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0">
          <Eye size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className={cn('text-xs px-2 py-0.5 rounded-full', SEVERITY_STYLE[log.severity] ?? '')}>
          {SEVERITY_LABEL[log.severity] ?? log.severity}
        </span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: modColor + '1a', color: modColor }}>
          {log.module}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto">{fmtDateTime(log.at)}</span>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-700">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <p className="text-xs text-slate-400 w-28 shrink-0 pt-0.5">{label}</p>
      <p className={cn('flex-1 text-slate-700 dark:text-slate-200 break-all', mono ? 'font-mono text-xs' : 'text-sm', small && 'text-[11px]')}>
        {value}
      </p>
    </div>
  )
}
