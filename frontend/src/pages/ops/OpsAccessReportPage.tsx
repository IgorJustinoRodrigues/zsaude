import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, LogIn, LogOut, AlertTriangle, Download,
  ChevronsUpDown, Calendar, ChevronLeft, ChevronRight,
  User, KeySquare, Monitor, CheckCircle2, ArrowLeft,
} from 'lucide-react'
import { type SystemLog } from '../../mock/logs'
import { auditApi, toSystemLog } from '../../api/audit'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { normalize, initials, cn } from '../../lib/utils'

interface UserOption { id: string; name: string; email: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: Date) {
  return date.toLocaleDateString('pt-BR') + ' ' +
    date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(date: Date) {
  return date.toLocaleDateString('pt-BR')
}

const LAST_N_OPTIONS = [
  { label: 'Últimos 10',  value: 10  },
  { label: 'Últimos 20',  value: 20  },
  { label: 'Últimos 50',  value: 50  },
  { label: 'Últimos 100', value: 100 },
  { label: 'Todos',       value: 0   },
]

const PAGE_SIZES = [10, 20, 50]

// ─── Searchable Select ────────────────────────────────────────────────────────

function UserSelect({
  value, onChange, users,
}: {
  value: string | null
  onChange: (id: string | null) => void
  users: UserOption[]
}) {
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return users
    return users.filter(u => normalize(u.name).includes(q) || normalize(u.email).includes(q))
  }, [query, users])

  const selected = value ? users.find(u => u.id === value) : null

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm transition-colors text-left',
          open
            ? 'border-sky-400 ring-2 ring-sky-100 dark:ring-sky-900/40 bg-white dark:bg-slate-900'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600',
        )}
      >
        {selected ? (
          <>
            <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {initials(selected.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{selected.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{selected.email}</p>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(null); setOpen(false) }}
              className="p-0.5 rounded text-slate-300 hover:text-slate-500 transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <User size={15} className="text-slate-400 shrink-0" />
            <span className="flex-1 text-slate-400">Selecionar usuário...</span>
            <ChevronsUpDown size={13} className="text-slate-300 shrink-0" />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-40 top-full mt-1.5 w-full min-w-[280px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          {/* Search inside dropdown */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                placeholder="Buscar usuário..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 outline-none focus:border-sky-400 text-slate-800 dark:text-slate-200 placeholder-slate-400"
              />
            </div>
          </div>
          {/* Options */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400 text-center">Nenhum usuário encontrado</p>
            ) : (
              filtered.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(u.id); setOpen(false); setQuery('') }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                    u.id === value && 'bg-sky-50 dark:bg-sky-950/40',
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                    u.id === value ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600',
                  )}>
                    {initials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium truncate', u.id === value ? 'text-sky-600 dark:text-sky-400' : 'text-slate-800 dark:text-slate-200')}>
                      {u.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                  </div>
                  {u.id === value && <CheckCircle2 size={14} className="text-sky-500 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OpsAccessReportPage() {
  const navigate = useNavigate()
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [lastN,        setLastN]        = useState(0)         // 0 = todos
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(20)
  const [allLogs,      setAllLogs]      = useState<SystemLog[]>([])

  // Carrega eventos de autenticação (login/logout/login_failed) do back
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const items = await auditApi.listAll({ module: 'AUTH' }, 2000)
        if (alive) setAllLogs(items.map(toSystemLog))
      } catch (e) {
        if (alive) toast.error('Falha ao carregar acessos',
          e instanceof HttpError ? e.message : '')
      }
    })()
    return () => { alive = false }
  }, [])

  // Usuários presentes nos logs (derivado)
  const userOptions = useMemo<UserOption[]>(() => {
    const map = new Map<string, UserOption>()
    for (const l of allLogs) {
      if (!l.userId || map.has(l.userId)) continue
      map.set(l.userId, { id: l.userId, name: l.userName, email: '' })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [allLogs])

  // reset page ao mudar filtros
  useEffect(() => setPage(1), [selectedUser, lastN, dateFrom, dateTo, pageSize])

  // Logs de acesso do usuário selecionado
  const rawLogs = useMemo(() => {
    const accessActions = ['login', 'logout', 'login_failed'] as const
    return allLogs
      .filter(l => accessActions.includes(l.action as typeof accessActions[number]))
      .filter(l => !selectedUser || l.userId === selectedUser)
      .sort((a, b) => b.at.getTime() - a.at.getTime())  // mais recente primeiro
  }, [allLogs, selectedUser])

  // Aplica filtros de período
  const filtered = useMemo(() => {
    if (lastN > 0) return rawLogs.slice(0, lastN)
    if (dateFrom || dateTo) {
      return rawLogs.filter(l => {
        const t = l.at.getTime()
        let ok = true
        if (dateFrom) ok = ok && t >= new Date(dateFrom).getTime()
        if (dateTo)   ok = ok && t <= new Date(dateTo + 'T23:59:59').getTime()
        return ok
      })
    }
    return rawLogs
  }, [rawLogs, lastN, dateFrom, dateTo])

  // Totais
  const totals = useMemo(() => ({
    logins:  filtered.filter(l => l.action === 'login').length,
    logouts: filtered.filter(l => l.action === 'logout').length,
    failed:  filtered.filter(l => l.action === 'login_failed').length,
    ips:     new Set(filtered.map(l => l.ip)).size,
  }), [filtered])

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)

  const clearPeriod = () => { setLastN(0); setDateFrom(''); setDateTo('') }

  // ── Export CSV ──────────────────────────────────────────────────────────────
  function exportCsv() {
    const rows = [
      ['Data/Hora', 'Usuário', 'Ação', 'Descrição', 'IP', 'User Agent'],
      ...filtered.map(l => [
        fmt(l.at),
        l.userName,
        l.action,
        l.description,
        l.ip,
        l.userAgent,
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const userName = selectedUser ? userOptions.find(u => u.id === selectedUser)?.name ?? 'usuario' : 'todos'
    a.download = `acessos_${normalize(userName).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Relatório exportado', `${filtered.length} registros · ${a.download}`)
  }

  const hasData = filtered.length > 0
  const userObj = selectedUser ? userOptions.find(u => u.id === selectedUser) : null

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/ops/relatorios')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mb-2"
          >
            <ArrowLeft size={12} />
            Relatórios
          </button>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <KeySquare size={20} className="text-sky-500" />
            Relatório de Acessos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Histórico de logins por usuário</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!hasData}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors shrink-0',
            hasData
              ? 'border-sky-300 text-sky-600 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-700 hover:bg-sky-100 dark:hover:bg-sky-950/50'
              : 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 bg-white dark:bg-slate-900 cursor-not-allowed',
          )}
        >
          <Download size={14} />
          Exportar CSV
          {hasData && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400">{filtered.length}</span>}
        </button>
      </div>

      {/* Select de usuário */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Usuário
        </label>
        <UserSelect
          value={selectedUser}
          onChange={id => { setSelectedUser(id); clearPeriod() }}
          users={userOptions}
        />
        {!selectedUser && (
          <p className="text-xs text-slate-400">Selecione um usuário para ver o histórico de acessos, ou deixe em branco para visualizar todos.</p>
        )}
      </div>

      {/* Filtros de período */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar size={11} /> Período
        </label>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Últimos N registros */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400">Quantidade de registros</p>
            <div className="flex flex-wrap gap-1.5">
              {LAST_N_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setLastN(opt.value); setDateFrom(''); setDateTo('') }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    lastN === opt.value && !dateFrom && !dateTo
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden sm:block w-px h-10 bg-slate-100 dark:bg-slate-800" />

          {/* Intervalo de datas */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400">Ou por intervalo de datas</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setLastN(0) }}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-700 dark:text-slate-200"
              />
              <span className="text-xs text-slate-400">até</span>
              <input
                type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setLastN(0) }}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-700 dark:text-slate-200"
              />
              {(dateFrom || dateTo) && (
                <button onClick={clearPeriod} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<LogIn size={16} />}
          label="Logins realizados"
          value={totals.logins}
          iconBg="bg-emerald-50 dark:bg-emerald-950/50"
          iconColor="text-emerald-500"
          valueColor="text-emerald-600 dark:text-emerald-400"
        />
        <SummaryCard
          icon={<LogOut size={16} />}
          label="Logouts"
          value={totals.logouts}
          iconBg="bg-slate-100 dark:bg-slate-800"
          iconColor="text-slate-500"
          valueColor="text-slate-600 dark:text-slate-300"
        />
        <SummaryCard
          icon={<AlertTriangle size={16} />}
          label="Tentativas falhas"
          value={totals.failed}
          iconBg="bg-red-50 dark:bg-red-950/50"
          iconColor="text-red-500"
          valueColor="text-red-600 dark:text-red-400"
        />
        <SummaryCard
          icon={<Monitor size={16} />}
          label="IPs únicos"
          value={totals.ips}
          iconBg="bg-sky-50 dark:bg-sky-950/50"
          iconColor="text-sky-500"
          valueColor="text-sky-600 dark:text-sky-400"
        />
      </div>

      {/* Tabela / estado vazio */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl gap-3 text-center">
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Search size={24} />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhum registro encontrado</p>
          <p className="text-xs text-slate-400">Ajuste os filtros ou selecione um período diferente.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">

          {/* Cabeçalho da tabela — desktop */}
          <div className="hidden md:grid md:grid-cols-[auto_1fr_auto_1fr_auto] gap-4 px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tipo</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {!selectedUser ? 'Usuário' : 'Descrição'}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Data / Hora</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">IP</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Módulo</span>
          </div>

          {/* Linhas */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginated.map(log => {
              const isLogin  = log.action === 'login'
              const isFailed = log.action === 'login_failed'

              return (
                <div key={log.id} className="group">
                  {/* Desktop */}
                  <div className="hidden md:grid md:grid-cols-[auto_1fr_auto_1fr_auto] gap-4 items-center px-5 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">

                    {/* Badge de tipo */}
                    <div className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold w-[110px] justify-center shrink-0',
                      isLogin  && 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
                      isFailed && 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400',
                      !isLogin && !isFailed && 'bg-slate-100 dark:bg-slate-800 text-slate-500',
                    )}>
                      {isLogin  && <><LogIn size={11} /> Login</>}
                      {isFailed && <><AlertTriangle size={11} /> Falha</>}
                      {!isLogin && !isFailed && <><LogOut size={11} /> Logout</>}
                    </div>

                    {/* Usuário ou descrição */}
                    <div className="min-w-0">
                      {!selectedUser ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                            {initials(log.userName)}
                          </div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{log.userName}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{log.description}</p>
                      )}
                    </div>

                    {/* Data */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmtDate(log.at)}</p>
                      <p className="text-[11px] text-slate-400 whitespace-nowrap">
                        {log.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>

                    {/* IP */}
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">{log.ip}</p>

                    {/* Módulo */}
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {log.module}
                    </span>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold',
                        isLogin  && 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
                        isFailed && 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400',
                        !isLogin && !isFailed && 'bg-slate-100 dark:bg-slate-800 text-slate-500',
                      )}>
                        {isLogin  && <><LogIn size={10} /> Login</>}
                        {isFailed && <><AlertTriangle size={10} /> Falha</>}
                        {!isLogin && !isFailed && <><LogOut size={10} /> Logout</>}
                      </div>
                      <p className="text-[11px] text-slate-400">{fmt(log.at)}</p>
                    </div>
                    {!selectedUser && (
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{log.userName}</p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400">{log.description}</p>
                    <p className="font-mono text-[11px] text-slate-400">{log.ip}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Paginação */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/20">
            {/* Info + page size */}
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">por página:</span>
                {PAGE_SIZES.map(s => (
                  <button
                    key={s}
                    onClick={() => setPageSize(s)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                      pageSize === s
                        ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Navegação */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft size={13} />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | '...')[]>((acc, p, i, arr) => {
                    if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={cn(
                          'w-7 h-7 rounded-lg text-xs font-medium transition-colors',
                          page === p
                            ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                        )}
                      >
                        {p}
                      </button>
                    )
                  )}
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, iconBg, iconColor, valueColor }: {
  icon: React.ReactNode
  label: string
  value: number
  iconBg: string
  iconColor: string
  valueColor: string
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
      <div className={cn('p-2 rounded-xl shrink-0', iconBg, iconColor)}>
        {icon}
      </div>
      <div>
        <p className={cn('text-2xl font-bold leading-none', valueColor)}>{value}</p>
        <p className="text-[11px] text-slate-400 mt-1 leading-tight">{label}</p>
      </div>
    </div>
  )
}
