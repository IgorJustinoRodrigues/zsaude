import { useState, useMemo } from 'react'
import {
  Search, X, Filter, Eye,
  LogIn, LogOut, AlertTriangle,
  FilePlus, FileEdit, Trash2, Download, Printer,
  ShieldAlert, KeyRound, ShieldOff,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import { mockSystemLogs, type SystemLog, type LogAction, type LogSeverity } from '../../mock/logs'
import { mockUsers } from '../../mock/users'
import { normalize, cn } from '../../lib/utils'

// ─── Meta ──────────────────────────────────────────────────────────────────────

const ACTION_META: Record<LogAction, { label: string; icon: React.ReactNode }> = {
  login:             { label: 'Login',            icon: <LogIn size={12} /> },
  logout:            { label: 'Logout',           icon: <LogOut size={12} /> },
  login_failed:      { label: 'Login falhou',     icon: <AlertTriangle size={12} /> },
  view:              { label: 'Visualização',      icon: <Eye size={12} /> },
  create:            { label: 'Criação',           icon: <FilePlus size={12} /> },
  edit:              { label: 'Edição',            icon: <FileEdit size={12} /> },
  delete:            { label: 'Exclusão',          icon: <Trash2 size={12} /> },
  export:            { label: 'Exportação',        icon: <Download size={12} /> },
  print:             { label: 'Impressão',         icon: <Printer size={12} /> },
  permission_change: { label: 'Permissão',         icon: <ShieldAlert size={12} /> },
  password_reset:    { label: 'Reset de senha',    icon: <KeyRound size={12} /> },
  block_user:        { label: 'Bloqueio',          icon: <ShieldOff size={12} /> },
}

const SEVERITY_STYLE: Record<LogSeverity, string> = {
  info:     'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  warning:  'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  error:    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 font-semibold',
}

const SEVERITY_LABEL: Record<LogSeverity, string> = {
  info: 'Info', warning: 'Aviso', error: 'Erro', critical: 'Crítico',
}

const ACTION_COLOR: Record<LogAction, string> = {
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
}

const ALL_MODULES = ['CLN', 'DGN', 'HSP', 'PLN', 'FSC', 'OPS']
const ALL_ACTIONS = Object.keys(ACTION_META) as LogAction[]
const ALL_SEVERITIES: LogSeverity[] = ['info', 'warning', 'error', 'critical']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(date: Date) {
  return date.toLocaleDateString('pt-BR') + ' · ' +
    date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatRelative(date: Date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (diff < 1)    return 'agora mesmo'
  if (diff < 60)   return `há ${diff}min`
  if (diff < 1440) return `há ${Math.floor(diff / 60)}h`
  return `há ${Math.floor(diff / 1440)}d`
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortField = 'at' | 'userName' | 'module' | 'action' | 'severity'
type SortDir   = 'asc' | 'desc'

function sortLogs(logs: SystemLog[], f: SortField, d: SortDir) {
  return [...logs].sort((a, b) => {
    const va = f === 'at' ? a.at.getTime() : String(a[f])
    const vb = f === 'at' ? b.at.getTime() : String(b[f])
    return d === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Período rápido em dias (0 = todos)
const PERIOD_OPTIONS = [
  { label: 'Todos', days: 0 },
  { label: 'Hoje',  days: 1 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
]

export function OpsLogsPage() {
  const [search,         setSearch]         = useState('')
  const [filterModule,   setFilterModule]   = useState<string>('Todos')
  const [filterAction,   setFilterAction]   = useState<LogAction | 'Todos'>('Todos')
  const [filterSeverity, setFilterSeverity] = useState<LogSeverity | 'Todos'>('Todos')
  const [filterUser,     setFilterUser]     = useState<string>('Todos')
  const [filterPeriod,   setFilterPeriod]   = useState<number>(0)      // dias; 0 = todos
  const [dateFrom,       setDateFrom]       = useState('')              // ISO date string
  const [dateTo,         setDateTo]         = useState('')
  const [showFilter,     setShowFilter]     = useState(false)
  const [sortField,      setSortField]      = useState<SortField>('at')
  const [sortDir,        setSortDir]        = useState<SortDir>('desc')
  const [selected,       setSelected]       = useState<SystemLog | null>(null)

  // Usuários únicos presentes nos logs
  const logUsers = useMemo(() => {
    const ids = [...new Set(mockSystemLogs.map(l => l.userId))]
    return ids.map(id => {
      const u = mockUsers.find(u => u.id === id)
      const name = mockSystemLogs.find(l => l.userId === id)?.userName ?? id
      return { id, name, active: !!u }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const filtered = useMemo(() => {
    const q = normalize(search)
    const now = Date.now()
    const base = mockSystemLogs.filter(l => {
      const matchModule   = filterModule   === 'Todos' || l.module   === filterModule
      const matchAction   = filterAction   === 'Todos' || l.action   === filterAction
      const matchSeverity = filterSeverity === 'Todos' || l.severity === filterSeverity
      const matchUser     = filterUser     === 'Todos' || l.userId   === filterUser
      const matchSearch   = !q || [l.userName, l.description, l.resource, l.ip, l.hash]
        .some(v => normalize(v).includes(q))

      let matchPeriod = true
      if (dateFrom || dateTo) {
        const t = l.at.getTime()
        if (dateFrom) matchPeriod = matchPeriod && t >= new Date(dateFrom).getTime()
        if (dateTo)   matchPeriod = matchPeriod && t <= new Date(dateTo + 'T23:59:59').getTime()
      } else if (filterPeriod > 0) {
        matchPeriod = l.at.getTime() >= now - filterPeriod * 86_400_000
      }

      return matchModule && matchAction && matchSeverity && matchUser && matchSearch && matchPeriod
    })
    return sortLogs(base, sortField, sortDir)
  }, [search, filterModule, filterAction, filterSeverity, filterUser, filterPeriod, dateFrom, dateTo, sortField, sortDir])

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir(f === 'at' ? 'desc' : 'asc') }
  }

  const hasFilter = filterModule !== 'Todos' || filterAction !== 'Todos' ||
    filterSeverity !== 'Todos' || filterUser !== 'Todos' ||
    filterPeriod !== 0 || !!dateFrom || !!dateTo

  const filterCount = [
    filterModule   !== 'Todos',
    filterAction   !== 'Todos',
    filterSeverity !== 'Todos',
    filterUser     !== 'Todos',
    filterPeriod !== 0 || !!dateFrom || !!dateTo,
  ].filter(Boolean).length

  const clearFilters = () => {
    setFilterModule('Todos'); setFilterAction('Todos')
    setFilterSeverity('Todos'); setFilterUser('Todos')
    setFilterPeriod(0); setDateFrom(''); setDateTo('')
  }

  const counts = useMemo(() => ({
    total:    mockSystemLogs.length,
    warning:  mockSystemLogs.filter(l => l.severity === 'warning').length,
    error:    mockSystemLogs.filter(l => l.severity === 'error').length,
    critical: mockSystemLogs.filter(l => l.severity === 'critical').length,
  }), [])

  return (
    <>
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Logs do sistema</h1>
        <p className="text-sm text-slate-500 mt-0.5">Auditoria completa de ações realizadas no sistema</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total de eventos" value={counts.total}  color="text-slate-700 dark:text-slate-200" bg="bg-slate-100 dark:bg-slate-800" />
        <SummaryCard label="Avisos"           value={counts.warning}  color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/40" />
        <SummaryCard label="Erros"            value={counts.error}    color="text-red-600 dark:text-red-400"     bg="bg-red-50 dark:bg-red-950/40" />
        <SummaryCard label="Críticos"         value={counts.critical} color="text-red-800 dark:text-red-300"     bg="bg-red-100 dark:bg-red-950/60" />
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por usuário, descrição, IP ou hash..."
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
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">

          {/* Linha 1: Período + datas customizadas */}
          <div className="flex flex-wrap gap-5">
            <FilterGroup label="Período">
              {PERIOD_OPTIONS.map(p => (
                <Pill
                  key={p.days}
                  active={filterPeriod === p.days && !dateFrom && !dateTo}
                  onClick={() => { setFilterPeriod(p.days); setDateFrom(''); setDateTo('') }}
                >
                  {p.label}
                </Pill>
              ))}
            </FilterGroup>

            <FilterGroup label="Intervalo personalizado">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setFilterPeriod(0) }}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-700 dark:text-slate-200"
                />
                <span className="text-xs text-slate-400">até</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setFilterPeriod(0) }}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-700 dark:text-slate-200"
                />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-300 hover:text-slate-500">
                    <X size={13} />
                  </button>
                )}
              </div>
            </FilterGroup>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* Linha 2: Usuário */}
          <FilterGroup label="Usuário">
            <div className="flex flex-wrap gap-1">
              <Pill active={filterUser === 'Todos'} onClick={() => setFilterUser('Todos')}>Todos</Pill>
              {logUsers.map(u => (
                <Pill key={u.id} active={filterUser === u.id} onClick={() => setFilterUser(u.id)}>
                  {u.name.split(' ').slice(0, 2).join(' ')}
                </Pill>
              ))}
            </div>
          </FilterGroup>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* Linha 3: Módulo + Severidade + Ação */}
          <div className="flex flex-wrap gap-5">
            <FilterGroup label="Módulo">
              {['Todos', ...ALL_MODULES].map(m => (
                <Pill key={m} active={filterModule === m} onClick={() => setFilterModule(m)}>{m}</Pill>
              ))}
            </FilterGroup>

            <FilterGroup label="Severidade">
              {(['Todos', ...ALL_SEVERITIES] as const).map(s => (
                <Pill key={s} active={filterSeverity === s} onClick={() => setFilterSeverity(s)}>
                  {s === 'Todos' ? 'Todos' : SEVERITY_LABEL[s]}
                </Pill>
              ))}
            </FilterGroup>

            <FilterGroup label="Ação">
              <div className="flex flex-wrap gap-1">
                <Pill active={filterAction === 'Todos'} onClick={() => setFilterAction('Todos')}>Todas</Pill>
                {ALL_ACTIONS.map(a => (
                  <Pill key={a} active={filterAction === a} onClick={() => setFilterAction(a)}>
                    {ACTION_META[a].label}
                  </Pill>
                ))}
              </div>
            </FilterGroup>
          </div>

          {hasFilter && (
            <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-3">
              <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum log encontrado</p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="lg:hidden space-y-2">
            {filtered.map(log => (
              <MobileLogCard key={log.id} log={log} onView={() => setSelected(log)} />
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th sortable field="at"       current={sortField} dir={sortDir} onSort={toggleSort}>Data / Hora</Th>
                  <Th sortable field="userName" current={sortField} dir={sortDir} onSort={toggleSort}>Usuário</Th>
                  <Th sortable field="action"   current={sortField} dir={sortDir} onSort={toggleSort}>Ação</Th>
                  <Th>Recurso</Th>
                  <Th sortable field="module"   current={sortField} dir={sortDir} onSort={toggleSort}>Módulo</Th>
                  <Th sortable field="severity" current={sortField} dir={sortDir} onSort={toggleSort}>Severidade</Th>
                  <th className="px-4 py-2.5 text-right">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(log => (
                  <LogRow key={log.id} log={log} onView={() => setSelected(log)} />
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
              <p className="text-xs text-slate-400">{filtered.length} de {counts.total} eventos</p>
            </div>
          </div>
        </>
      )}
    </div>

    {/* Modal de detalhes */}
    {selected && <LogDetailModal log={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

// ─── Log detail modal ─────────────────────────────────────────────────────────

function LogDetailModal({ log, onClose }: { log: SystemLog; onClose: () => void }) {
  const meta     = ACTION_META[log.action]
  const modColor = MODULE_COLOR[log.module] ?? '#6b7280'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', ACTION_COLOR[log.action])}>
              {meta.icon}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{meta.label}</h2>
              <p className="text-[11px] text-slate-400">{log.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">

          {/* Severidade + módulo */}
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', SEVERITY_STYLE[log.severity])}>
              {SEVERITY_LABEL[log.severity]}
            </span>
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: modColor + '1a', color: modColor }}
            >
              {log.module}
            </span>
          </div>

          {/* Identificação */}
          <Section title="Identificação">
            <Row label="ID do evento"   value={log.id} mono />
            <Row label="Hash"           value={log.hash} mono />
            <Row label="Data e hora"    value={formatDateTime(log.at)} />
            <Row label="Recurso"        value={`${log.resource} · ${log.resourceId}`} mono />
          </Section>

          {/* Usuário */}
          <Section title="Usuário">
            <Row label="Nome"      value={log.userName} />
            <Row label="ID"        value={log.userId} mono />
            <Row label="Endereço IP" value={log.ip} mono />
            <Row label="User-Agent"  value={log.userAgent} mono small />
          </Section>

          {/* Detalhes */}
          <Section title="Detalhes da ação">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3">
              {log.details}
            </p>
          </Section>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 md:p-4">
      <div className={cn('text-xl font-bold leading-none', color)}>{value}</div>
      <p className={cn('text-[11px] mt-1 px-1.5 py-0.5 rounded-md inline-block', bg, color)}>{label}</p>
    </div>
  )
}

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

function Th({ children, sortable, field, current, dir, onSort }: {
  children?: React.ReactNode
  sortable?: boolean
  field?: SortField
  current?: SortField
  dir?: SortDir
  onSort?: (f: SortField) => void
}) {
  const active = sortable && field === current
  return (
    <th className="px-4 py-2.5 text-left">
      {sortable && field && onSort ? (
        <button
          onClick={() => onSort(field)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          {children}
          {active
            ? dir === 'asc' ? <ChevronUp size={11} className="text-sky-500" /> : <ChevronDown size={11} className="text-sky-500" />
            : <ChevronsUpDown size={11} className="opacity-40" />}
        </button>
      ) : (
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</span>
      )}
    </th>
  )
}

function LogRow({ log, onView }: { log: SystemLog; onView: () => void }) {
  const meta     = ACTION_META[log.action]
  const modColor = MODULE_COLOR[log.module] ?? '#6b7280'
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-xs text-slate-700 dark:text-slate-200">{formatDateTime(log.at)}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{formatRelative(log.at)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{log.userName}</p>
        <p className="text-[10px] font-mono text-slate-400">{log.ip}</p>
      </td>
      <td className="px-4 py-3">
        <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium', ACTION_COLOR[log.action])}>
          {meta.icon}
          {meta.label}
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[160px]">{log.description}</p>
        <p className="text-[10px] text-slate-400 font-mono">{log.resource}</p>
      </td>
      <td className="px-4 py-3">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: modColor + '1a', color: modColor }}
        >
          {log.module}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-xs px-2 py-0.5 rounded-full', SEVERITY_STYLE[log.severity])}>
          {SEVERITY_LABEL[log.severity]}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={onView}
          title="Ver detalhes"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Eye size={14} />
        </button>
      </td>
    </tr>
  )
}

function MobileLogCard({ log, onView }: { log: SystemLog; onView: () => void }) {
  const meta     = ACTION_META[log.action]
  const modColor = MODULE_COLOR[log.module] ?? '#6b7280'
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5', ACTION_COLOR[log.action])}>
            {meta.icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{log.description}</p>
            <p className="text-xs text-slate-400 mt-0.5">{log.userName} · {log.ip}</p>
          </div>
        </div>
        <button onClick={onView} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
          <Eye size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className={cn('text-xs px-2 py-0.5 rounded-full', SEVERITY_STYLE[log.severity])}>
          {SEVERITY_LABEL[log.severity]}
        </span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: modColor + '1a', color: modColor }}>
          {log.module}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto">{formatDateTime(log.at)}</span>
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
      <p className={cn(
        'flex-1 text-slate-700 dark:text-slate-200 break-all',
        mono ? 'font-mono text-xs' : 'text-sm',
        small && 'text-[11px]',
      )}>
        {value}
      </p>
    </div>
  )
}
