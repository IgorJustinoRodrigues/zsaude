import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Search, X, Filter, Eye, Download,
  Activity, Users, Clock, Layers,
  LogIn, LogOut, AlertTriangle, FilePlus, FileEdit, Trash2,
  Printer, ShieldAlert, KeyRound, ShieldOff,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import { type SystemLog, type LogAction } from '../../mock/logs'
import { auditApi, toSystemLog } from '../../api/audit'
import { AuditDetails } from '../../components/shared/AuditDetails'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { normalize, initials, cn } from '../../lib/utils'

// ─── Meta ─────────────────────────────────────────────────────────────────────

const ACTION_META: Record<LogAction, { label: string; icon: React.ReactNode }> = {
  login:             { label: 'Login',          icon: <LogIn size={12} /> },
  logout:            { label: 'Saída',         icon: <LogOut size={12} /> },
  login_failed:      { label: 'Falha de entrada',   icon: <AlertTriangle size={12} /> },
  view:              { label: 'Visualização',   icon: <Eye size={12} /> },
  create:            { label: 'Criação',        icon: <FilePlus size={12} /> },
  edit:              { label: 'Edição',         icon: <FileEdit size={12} /> },
  delete:            { label: 'Exclusão',       icon: <Trash2 size={12} /> },
  export:            { label: 'Exportação',     icon: <Download size={12} /> },
  print:             { label: 'Impressão',      icon: <Printer size={12} /> },
  permission_change: { label: 'Permissão',      icon: <ShieldAlert size={12} /> },
  password_reset:    { label: 'Reset de senha', icon: <KeyRound size={12} /> },
  block_user:        { label: 'Bloqueio',       icon: <ShieldOff size={12} /> },
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

const MODULE_META: Record<string, { color: string; bar: string }> = {
  CLN: { color: '#0ea5e9', bar: 'bg-sky-400' },
  DGN: { color: '#8b5cf6', bar: 'bg-violet-400' },
  HSP: { color: '#f59e0b', bar: 'bg-amber-400' },
  PLN: { color: '#10b981', bar: 'bg-emerald-400' },
  FSC: { color: '#f97316', bar: 'bg-orange-400' },
  OPS: { color: '#6b7280', bar: 'bg-slate-400' },
}

const ALL_MODULES = ['CLN', 'DGN', 'HSP', 'PLN', 'FSC', 'OPS']
const ALL_ACTIONS = Object.keys(ACTION_META) as LogAction[]

const PERIOD_OPTIONS = [
  { label: 'Todos',   days: 0  },
  { label: 'Hoje',    days: 1  },
  { label: '7 dias',  days: 7  },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
]

const PAGE_SIZES = [10, 20, 50]
type SortField = 'at' | 'userName' | 'module' | 'action'
type SortDir   = 'asc' | 'desc'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date) { return d.toLocaleDateString('pt-BR') }
function fmtTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function fmtDateTime(d: Date) { return fmtDate(d) + ' ' + fmtTime(d) }

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OpsActivityReportPage() {
  const navigate = useNavigate()

  const [search,       setSearch]       = useState('')
  const [filterModule, setFilterModule] = useState<string[]>([])
  const [filterAction, setFilterAction] = useState<LogAction[]>([])
  const [filterUser,   setFilterUser]   = useState<string[]>([])
  const [filterPeriod, setFilterPeriod] = useState(0)
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [showFilter,   setShowFilter]   = useState(false)
  const [sortField,    setSortField]    = useState<SortField>('at')
  const [sortDir,      setSortDir]      = useState<SortDir>('desc')
  const [selected,     setSelected]     = useState<SystemLog | null>(null)
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(20)
  const [logs,         setLogs]         = useState<SystemLog[]>([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const items = await auditApi.listAll({}, 2000)
        if (alive) setLogs(items.map(toSystemLog))
      } catch (e) {
        if (alive) toast.error('Falha ao carregar atividade',
          e instanceof HttpError ? e.message : '')
      }
    })()
    return () => { alive = false }
  }, [])

  const toggleArr = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]

  const logUsers = useMemo(() => {
    const ids = [...new Set(logs.map(l => l.userId).filter(Boolean))]
    return ids.map(id => ({
      id, name: logs.find(l => l.userId === id)?.userName ?? id,
    })).sort((a, b) => a.name.localeCompare(b.name))
  }, [logs])

  // Conjunto filtrado
  const filtered = useMemo(() => {
    const q   = normalize(search)
    const now = Date.now()
    const list = logs.filter(l => {
      if (filterModule.length && !filterModule.includes(l.module))   return false
      if (filterAction.length && !filterAction.includes(l.action))   return false
      if (filterUser.length   && !filterUser.includes(l.userId))     return false
      if (q && !([l.userName, l.description, l.resource, l.ip].some(v => normalize(v).includes(q)))) return false
      if (dateFrom || dateTo) {
        const t = l.at.getTime()
        if (dateFrom && t < new Date(dateFrom).getTime()) return false
        if (dateTo   && t > new Date(dateTo + 'T23:59:59').getTime()) return false
      } else if (filterPeriod > 0) {
        if (l.at.getTime() < now - filterPeriod * 86_400_000) return false
      }
      return true
    })
    return [...list].sort((a, b) => {
      const va = sortField === 'at' ? a.at.getTime() : String(a[sortField])
      const vb = sortField === 'at' ? b.at.getTime() : String(b[sortField])
      return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
    })
  }, [search, filterModule, filterAction, filterUser, filterPeriod, dateFrom, dateTo, sortField, sortDir])

  // ── Estatísticas ─────────────────────────────────────────────────────────────

  // Ações por módulo
  const byModule = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(l => map.set(l.module, (map.get(l.module) ?? 0) + 1))
    return ALL_MODULES.map(m => ({ module: m, count: map.get(m) ?? 0 }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  // Ações por hora (0–23)
  const byHour = useMemo(() => {
    const counts = Array(24).fill(0)
    filtered.forEach(l => counts[l.at.getHours()]++)
    return counts.map((count, h) => ({ h, label: `${String(h).padStart(2, '0')}h`, count }))
  }, [filtered])

  const maxHour  = Math.max(...byHour.map(h => h.count), 1)
  const peakHour = byHour.reduce((best, h) => h.count > best.count ? h : best, byHour[0])

  // Top usuários
  const topUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    filtered.forEach(l => {
      if (!map.has(l.userId)) map.set(l.userId, { id: l.userId, name: l.userName, count: 0 })
      map.get(l.userId)!.count++
    })
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  }, [filtered])

  // Ações por tipo
  const byAction = useMemo(() => {
    const map = new Map<LogAction, number>()
    filtered.forEach(l => map.set(l.action, (map.get(l.action) ?? 0) + 1))
    return ALL_ACTIONS.map(a => ({ action: a, count: map.get(a) ?? 0 }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const maxAction = Math.max(...byAction.map(a => a.count), 1)

  // Módulo mais acessado
  const topModule = byModule[0]?.module ?? '—'
  // Usuário mais ativo
  const topUser   = topUsers[0]?.name.split(' ').slice(0, 2).join(' ') ?? '—'

  const hasFilter = filterModule.length > 0 || filterAction.length > 0 ||
    filterUser.length > 0 || filterPeriod !== 0 || !!dateFrom || !!dateTo
  const filterCount = [filterModule.length > 0, filterAction.length > 0, filterUser.length > 0,
    filterPeriod !== 0 || !!dateFrom || !!dateTo].filter(Boolean).length

  const clearFilters = () => {
    setFilterModule([]); setFilterAction([]); setFilterUser([])
    setFilterPeriod(0); setDateFrom(''); setDateTo(''); setPage(1)
  }

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir(f === 'at' ? 'desc' : 'asc') }
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Export CSV
  function exportCsv() {
    const rows = [
      ['Data', 'Hora', 'Usuário', 'Ação', 'Módulo', 'Recurso', 'Recurso ID', 'Descrição', 'IP'],
      ...filtered.map(l => [
        fmtDate(l.at), fmtTime(l.at), l.userName,
        ACTION_META[l.action].label, l.module,
        l.resource, l.resourceId, l.description, l.ip,
      ]),
    ]
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `atividade_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    toast.success('Relatório exportado', `${filtered.length} ações · ${a.download}`)
  }

  return (
    <>
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <button onClick={() => navigate('/ops/relatorios')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mb-2">
            <ArrowLeft size={12} /> Relatórios
          </button>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity size={20} className="text-indigo-500" />
            Relatório de Atividade
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Volume de ações por módulo, horário e usuário</p>
        </div>
        <button onClick={exportCsv} disabled={filtered.length === 0}
          className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors shrink-0',
            filtered.length > 0
              ? 'border-indigo-300 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-950/50'
              : 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 bg-white dark:bg-slate-900 cursor-not-allowed')}>
          <Download size={14} />
          Exportar CSV
          {filtered.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
              {filtered.length}
            </span>
          )}
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={<Activity size={16} />} label="Total de ações" value={String(filtered.length)}
          iconBg="bg-indigo-50 dark:bg-indigo-950/50" iconColor="text-indigo-500" valueColor="text-indigo-600 dark:text-indigo-400" />
        <MetricCard icon={<Users size={16} />} label="Usuário mais ativo" value={topUser}
          iconBg="bg-violet-50 dark:bg-violet-950/50" iconColor="text-violet-500" valueColor="text-violet-600 dark:text-violet-400" small />
        <MetricCard icon={<Layers size={16} />} label="Módulo mais acessado" value={topModule}
          iconBg="bg-sky-50 dark:bg-sky-950/50" iconColor="text-sky-500" valueColor="text-sky-600 dark:text-sky-400" />
        <MetricCard icon={<Clock size={16} />} label="Hora de pico"
          value={peakHour.count > 0 ? peakHour.label : '—'}
          iconBg="bg-amber-50 dark:bg-amber-950/50" iconColor="text-amber-500" valueColor="text-amber-600 dark:text-amber-400" />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Atividade por módulo */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Por módulo</p>
          {byModule.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {byModule.map(row => {
                const meta = MODULE_META[row.module]
                const pct  = Math.round((row.count / (byModule[0].count || 1)) * 100)
                return (
                  <div key={row.module}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold" style={{ color: meta.color }}>{row.module}</span>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{row.count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', meta.bar)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Distribuição horária */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 lg:col-span-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Distribuição por hora do dia</p>
          <div className="flex items-end gap-[3px] h-24">
            {byHour.map(({ h, label, count }) => {
              const pct     = maxHour > 0 ? (count / maxHour) * 100 : 0
              const isPeak  = h === peakHour.h && count > 0
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className={cn('w-full rounded-t transition-all', isPeak ? 'bg-indigo-500' : 'bg-indigo-200 dark:bg-indigo-900/60 group-hover:bg-indigo-400')}
                      style={{ height: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  {/* Tooltip on hover */}
                  {count > 0 && (
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                      <div className="bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                        {label}: {count}
                      </div>
                      <div className="w-1.5 h-1.5 bg-slate-800 rotate-45 -mt-0.5" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {/* Labels de hora (a cada 4h) */}
          <div className="flex mt-1.5">
            {byHour.map(({ h, label }) => (
              <div key={h} className="flex-1 text-center">
                {h % 4 === 0 && (
                  <span className="text-[9px] text-slate-400">{label}</span>
                )}
              </div>
            ))}
          </div>
          {peakHour.count > 0 && (
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              Pico de atividade às <span className="font-semibold text-indigo-500">{peakHour.label}</span> com {peakHour.count} ação{peakHour.count !== 1 ? 'ões' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top usuários */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Usuários mais ativos</p>
          {topUsers.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {topUsers.map((u, i) => {
                const pct = Math.round((u.count / (topUsers[0].count || 1)) * 100)
                return (
                  <div key={u.id} className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 w-4 shrink-0">{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {initials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                          {u.name.split(' ').slice(0, 2).join(' ')}
                        </p>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2 shrink-0">{u.count}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Tipos de ação */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Tipos de ação</p>
          {byAction.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Sem dados</p>
          ) : (
            <div className="space-y-2.5">
              {byAction.map(row => {
                const pct = Math.round((row.count / maxAction) * 100)
                const meta = ACTION_META[row.action]
                return (
                  <div key={row.action} className="flex items-center gap-3">
                    <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 w-[120px]', ACTION_COLOR[row.action])}>
                      {meta.icon}
                      <span className="truncate">{meta.label}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-slate-400 dark:bg-slate-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 w-7 text-right shrink-0">{row.count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="Buscar por usuário, descrição, recurso ou IP..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X size={13} />
            </button>
          )}
        </div>
        <button onClick={() => setShowFilter(f => !f)}
          className={cn('inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors shrink-0',
            showFilter || hasFilter
              ? 'border-indigo-400 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-700'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-slate-300')}>
          <Filter size={13} />
          Filtros
          {hasFilter && (
            <span className="w-4 h-4 text-[9px] font-bold rounded-full bg-indigo-500 text-white flex items-center justify-center">
              {filterCount}
            </span>
          )}
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilter && (
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">

          <div className="flex flex-wrap gap-5">
            <FilterSection label="Período rápido">
              {PERIOD_OPTIONS.map(p => (
                <Pill key={p.days} active={filterPeriod === p.days && !dateFrom && !dateTo}
                  onClick={() => { setFilterPeriod(p.days); setDateFrom(''); setDateTo(''); setPage(1) }}>
                  {p.label}
                </Pill>
              ))}
            </FilterSection>
            <FilterSection label="Intervalo personalizado">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setFilterPeriod(0); setPage(1) }}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-indigo-400 text-slate-700 dark:text-slate-200"
                />
                <span className="text-xs text-slate-400">até</span>
                <input type="date" value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setFilterPeriod(0); setPage(1) }}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-indigo-400 text-slate-700 dark:text-slate-200"
                />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-300 hover:text-slate-500"><X size={13} /></button>
                )}
              </div>
            </FilterSection>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          <div className="flex flex-wrap gap-5">
            <FilterSection label="Módulo">
              {ALL_MODULES.map(m => (
                <Pill key={m} active={filterModule.includes(m)}
                  onClick={() => { setFilterModule(prev => toggleArr(prev, m)); setPage(1) }}>
                  {m}
                </Pill>
              ))}
            </FilterSection>
            <FilterSection label="Tipo de ação">
              <div className="flex flex-wrap gap-1">
                {ALL_ACTIONS.map(a => (
                  <Pill key={a} active={filterAction.includes(a)}
                    onClick={() => { setFilterAction(prev => toggleArr(prev, a)); setPage(1) }}>
                    {ACTION_META[a].label}
                  </Pill>
                ))}
              </div>
            </FilterSection>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          <FilterSection label="Usuário">
            <div className="flex flex-wrap gap-1">
              {logUsers.map(u => (
                <Pill key={u.id} active={filterUser.includes(u.id)}
                  onClick={() => { setFilterUser(prev => toggleArr(prev, u.id)); setPage(1) }}>
                  {u.name.split(' ').slice(0, 2).join(' ')}
                </Pill>
              ))}
            </div>
          </FilterSection>

          {hasFilter && (
            <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-3">
              <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline underline-offset-2">
                Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabela de ações */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl gap-3 text-center">
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400"><Search size={24} /></div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhuma ação encontrada</p>
          <p className="text-xs text-slate-400">Ajuste os filtros ou a busca.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th sortable field="at"       current={sortField} dir={sortDir} onSort={toggleSort}>Data / Hora</Th>
                  <Th sortable field="userName" current={sortField} dir={sortDir} onSort={toggleSort}>Usuário</Th>
                  <Th sortable field="action"   current={sortField} dir={sortDir} onSort={toggleSort}>Ação</Th>
                  <Th>Descrição</Th>
                  <Th sortable field="module"   current={sortField} dir={sortDir} onSort={toggleSort}>Módulo</Th>
                  <th className="px-4 py-2.5 text-right w-12">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ver</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginated.map(log => <ActivityRow key={log.id} log={log} onView={() => setSelected(log)} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {paginated.map(log => <ActivityMobileCard key={log.id} log={log} onView={() => setSelected(log)} />)}
          </div>

          {/* Paginação */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/20">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} ação{filtered.length !== 1 ? 'ões' : ''}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">por página:</span>
                {PAGE_SIZES.map(s => (
                  <button key={s} onClick={() => { setPageSize(s); setPage(1) }}
                    className={cn('px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                      pageSize === s ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <ChevronDown size={13} className="rotate-90" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '...')[]>((acc, p, i, arr) => {
                    if (i > 0 && typeof arr[i-1] === 'number' && (p as number) - (arr[i-1] as number) > 1) acc.push('...')
                    acc.push(p); return acc
                  }, [])
                  .map((p, i) => p === '...'
                    ? <span key={`e-${i}`} className="px-1 text-xs text-slate-400">…</span>
                    : <button key={p} onClick={() => setPage(p as number)}
                        className={cn('w-7 h-7 rounded-lg text-xs font-medium transition-colors',
                          page === p ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
                        {p}
                      </button>
                  )}
              </div>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <ChevronDown size={13} className="-rotate-90" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {selected && <DetailModal log={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

// ─── ActivityRow ──────────────────────────────────────────────────────────────

function ActivityRow({ log, onView }: { log: SystemLog; onView: () => void }) {
  const act      = ACTION_META[log.action]
  const modColor = MODULE_META[log.module]?.color ?? '#6b7280'
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{fmtDate(log.at)}</p>
        <p className="text-[11px] font-mono text-slate-400">{fmtTime(log.at)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px]">{log.userName}</p>
        <p className="text-[10px] font-mono text-slate-400">{log.ip}</p>
      </td>
      <td className="px-4 py-3">
        <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap', ACTION_COLOR[log.action])}>
          {act.icon} {act.label}
        </div>
      </td>
      <td className="px-4 py-3 max-w-[220px]">
        <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{log.description}</p>
        <p className="text-[10px] font-mono text-slate-400">{log.resource}</p>
      </td>
      <td className="px-4 py-3">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: modColor + '1a', color: modColor }}>
          {log.module}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={onView} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <Eye size={14} />
        </button>
      </td>
    </tr>
  )
}

// ─── ActivityMobileCard ───────────────────────────────────────────────────────

function ActivityMobileCard({ log, onView }: { log: SystemLog; onView: () => void }) {
  const act      = ACTION_META[log.action]
  const modColor = MODULE_META[log.module]?.color ?? '#6b7280'
  return (
    <div className="px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <div className="flex items-start gap-2.5">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5', ACTION_COLOR[log.action])}>
          {act.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{log.description}</p>
          <p className="text-xs text-slate-400 mt-0.5">{log.userName} · {log.ip}</p>
        </div>
        <button onClick={onView} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 transition-colors">
          <Eye size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2 ml-9 flex-wrap">
        <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium', ACTION_COLOR[log.action])}>
          {act.icon} {act.label}
        </div>
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: modColor + '1a', color: modColor }}>
          {log.module}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto">{fmtDate(log.at)} {fmtTime(log.at)}</span>
      </div>
    </div>
  )
}

// ─── DetailModal ──────────────────────────────────────────────────────────────

function DetailModal({ log, onClose }: { log: SystemLog; onClose: () => void }) {
  const act      = ACTION_META[log.action]
  const modColor = MODULE_META[log.module]?.color ?? '#6b7280'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', ACTION_COLOR[log.action])}>
              {act.icon}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{act.label}</h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[280px]">{log.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          <div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: modColor + '1a', color: modColor }}>
              {log.module}
            </span>
          </div>
          <ModalSection title="Identificação">
            <ModalRow label="ID"        value={log.id}   mono />
            <ModalRow label="Hash"      value={log.hash} mono />
            <ModalRow label="Data/Hora" value={fmtDateTime(log.at)} />
            <ModalRow label="Recurso"   value={`${log.resource} · ${log.resourceId}`} mono />
          </ModalSection>
          <ModalSection title="Usuário">
            <ModalRow label="Nome"       value={log.userName} />
            <ModalRow label="ID"         value={log.userId}   mono />
            <ModalRow label="IP"         value={log.ip}       mono />
            <ModalRow label="User-Agent" value={log.userAgent} mono small />
          </ModalSection>
          <ModalSection title="Detalhes">
            <AuditDetails details={log.details} />
          </ModalSection>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, iconBg, iconColor, valueColor, small }: {
  icon: React.ReactNode; label: string; value: string
  iconBg: string; iconColor: string; valueColor: string; small?: boolean
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
      <div className={cn('p-2 rounded-xl shrink-0', iconBg, iconColor)}>{icon}</div>
      <div className="min-w-0">
        <p className={cn('font-bold leading-none truncate', small ? 'text-base' : 'text-2xl', valueColor)}>{value}</p>
        <p className="text-[11px] text-slate-400 mt-1 leading-tight">{label}</p>
      </div>
    </div>
  )
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
        active ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
               : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700')}>
      {children}
    </button>
  )
}

function Th({ children, sortable, field, current, dir, onSort }: {
  children?: React.ReactNode; sortable?: boolean
  field?: SortField; current?: SortField; dir?: SortDir; onSort?: (f: SortField) => void
}) {
  const active = sortable && field === current
  return (
    <th className="px-4 py-2.5 text-left">
      {sortable && field && onSort ? (
        <button onClick={() => onSort(field)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          {children}
          {active
            ? dir === 'asc' ? <ChevronUp size={11} className="text-indigo-500" /> : <ChevronDown size={11} className="text-indigo-500" />
            : <ChevronsUpDown size={11} className="opacity-40" />}
        </button>
      ) : <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</span>}
    </th>
  )
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-700">{children}</div>
    </div>
  )
}

function ModalRow({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <p className="text-xs text-slate-400 w-24 shrink-0 pt-0.5">{label}</p>
      <p className={cn('flex-1 text-slate-700 dark:text-slate-200 break-all', mono ? 'font-mono text-xs' : 'text-sm', small && 'text-[11px]')}>{value}</p>
    </div>
  )
}
