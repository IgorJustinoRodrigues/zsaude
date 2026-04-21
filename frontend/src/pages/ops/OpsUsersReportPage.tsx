import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Search, X, Download, ChevronDown, ChevronUp,
  ChevronsUpDown, Filter, Users, UserCheck, UserX, ShieldOff,
  Calendar, MapPin, Building2,
} from 'lucide-react'
import { userApi, type UserListItem, type UserDetail, type UserStats } from '../../api/users'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { normalize, initials, cn } from '../../lib/utils'
import type { SystemId } from '../../types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MODULE_META: Record<string, { label: string; color: string; bg: string }> = {
  cln: { label: 'CLN', color: 'text-sky-600 dark:text-sky-400',     bg: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800'     },
  dgn: { label: 'DGN', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-800' },
  hsp: { label: 'HSP', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800'   },
  pln: { label: 'PLN', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800' },
  fsc: { label: 'FSC', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800' },
  ops: { label: 'OPS', color: 'text-slate-600 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'  },
}

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  Ativo:    { label: 'Ativo',     dot: 'bg-emerald-500', badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  Inativo:  { label: 'Inativo',   dot: 'bg-slate-400',   badge: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
  Bloqueado:{ label: 'Bloqueado', dot: 'bg-red-500',     badge: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' },
}

const ALL_MODULES: SystemId[] = ['cln', 'dgn', 'hsp', 'pln', 'fsc', 'ops', 'ind', 'rec', 'esu']

type SortField = 'name' | 'primaryRole' | 'status' | 'createdAt'
type SortDir   = 'asc' | 'desc'

function fmtIso(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OpsUsersReportPage() {
  const navigate = useNavigate()

  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterModule, setFilterModule] = useState<string[]>([])
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [showFilter,   setShowFilter]   = useState(false)
  const [sortField,    setSortField]    = useState<SortField>('name')
  const [sortDir,      setSortDir]      = useState<SortDir>('asc')
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(10)

  const [users,        setUsers]        = useState<UserListItem[]>([])
  const [stats,        setStats]        = useState<UserStats | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [detailCache,  setDetailCache]  = useState<Record<string, UserDetail>>({})

  // Carrega lista + stats iniciais (até 200 usuários, conforme limite do back)
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [list, st] = await Promise.all([
          userApi.list({ pageSize: 200 }),
          userApi.stats(),
        ])
        if (!alive) return
        setUsers(list.items)
        setStats(st)
      } catch (e) {
        if (alive) toast.error('Falha ao carregar usuários',
          e instanceof HttpError ? e.message : '')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const toggleStatus = (s: string) =>
    setFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const toggleModule = (m: string) =>
    setFilterModule(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const clearFilters = () => {
    setFilterStatus([]); setFilterModule([])
    setDateFrom(''); setDateTo('')
  }

  const hasFilter = filterStatus.length > 0 || filterModule.length > 0 || !!dateFrom || !!dateTo

  const filtered = useMemo(() => {
    const q = normalize(search)
    const list = users.filter(u => {
      if (q && !normalize(u.name).includes(q) && !normalize(u.email).includes(q) &&
          !normalize(u.cpf).includes(q) && !normalize(u.primaryRole).includes(q)) return false
      if (filterStatus.length && !filterStatus.includes(u.status)) return false
      if (filterModule.length) {
        if (!filterModule.every(m => u.modules.includes(m as SystemId))) return false
      }
      if (dateFrom || dateTo) {
        const t = new Date(u.createdAt).getTime()
        if (dateFrom && t < new Date(dateFrom).getTime()) return false
        if (dateTo   && t > new Date(dateTo + 'T23:59:59').getTime()) return false
      }
      return true
    })
    list.sort((a, b) => {
      let va: string, vb: string
      if (sortField === 'createdAt') { va = a.createdAt; vb = b.createdAt }
      else if (sortField === 'status') { va = a.status; vb = b.status }
      else if (sortField === 'primaryRole') { va = a.primaryRole; vb = b.primaryRole }
      else { va = a.name; vb = b.name }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [users, search, filterStatus, filterModule, dateFrom, dateTo, sortField, sortDir])

  const totals = stats ?? { total: 0, ativo: 0, inativo: 0, bloqueado: 0 }

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir(f === 'createdAt' ? 'desc' : 'asc') }
  }

  useEffect(() => { setPage(1) }, [filtered.length])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Carrega detalhe quando expande uma linha
  const expand = useCallback(async (userId: string) => {
    if (expanded === userId) {
      setExpanded(null)
      return
    }
    setExpanded(userId)
    if (!detailCache[userId]) {
      try {
        const d = await userApi.get(userId)
        setDetailCache(prev => ({ ...prev, [userId]: d }))
      } catch (e) {
        toast.error('Falha ao carregar detalhe',
          e instanceof HttpError ? e.message : '')
      }
    }
  }, [expanded, detailCache])

  // ── Export CSV ──────────────────────────────────────────────────────────────
  function exportCsv() {
    const rows = [
      ['Nome', 'Nome de acesso', 'E-mail', 'CPF', 'Perfil', 'Status', 'Módulos', 'Municípios', 'Unidades', 'Cadastrado em'],
      ...filtered.map(u => [
        u.name, u.login, u.email, u.cpf, u.primaryRole,
        u.status,
        u.modules.join(', ').toUpperCase(),
        String(u.municipalityCount),
        String(u.facilityCount),
        fmtIso(u.createdAt),
      ]),
    ]
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `usuarios_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Relatório exportado', `${filtered.length} usuários · ${a.download}`)
  }

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
            <Users size={20} className="text-violet-500" />
            Relatório de Usuários
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Usuários cadastrados e seus módulos de acesso</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors shrink-0',
            filtered.length > 0
              ? 'border-violet-300 text-violet-600 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-950/50'
              : 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 bg-white dark:bg-slate-900 cursor-not-allowed',
          )}
        >
          <Download size={14} />
          Exportar CSV
          {filtered.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">
              {filtered.length}
            </span>
          )}
        </button>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={<Users size={16} />}      label="Total de usuários" value={totals.total}
          iconBg="bg-slate-100 dark:bg-slate-800" iconColor="text-slate-500" valueColor="text-slate-700 dark:text-slate-200" />
        <SummaryCard icon={<UserCheck size={16} />}  label="Ativos"           value={totals.ativo}
          iconBg="bg-emerald-50 dark:bg-emerald-950/50" iconColor="text-emerald-500" valueColor="text-emerald-600 dark:text-emerald-400" />
        <SummaryCard icon={<UserX size={16} />}      label="Inativos"         value={totals.inativo}
          iconBg="bg-slate-100 dark:bg-slate-800" iconColor="text-slate-400" valueColor="text-slate-500 dark:text-slate-400" />
        <SummaryCard icon={<ShieldOff size={16} />}  label="Bloqueados"       value={totals.bloqueado}
          iconBg="bg-red-50 dark:bg-red-950/50" iconColor="text-red-500" valueColor="text-red-600 dark:text-red-400" />
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail, CPF ou perfil..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-violet-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400"
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
            'inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors shrink-0',
            showFilter || hasFilter
              ? 'border-violet-400 text-violet-600 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-700'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 hover:border-slate-300',
          )}
        >
          <Filter size={13} />
          Filtros
          {hasFilter && (
            <span className="w-4 h-4 text-[9px] font-bold rounded-full bg-violet-500 text-white flex items-center justify-center">
              {[filterStatus.length > 0, filterModule.length > 0, !!(dateFrom || dateTo)].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilter && (
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {(['Ativo', 'Inativo', 'Bloqueado'] as const).map(s => (
                <button key={s} onClick={() => toggleStatus(s)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                    filterStatus.includes(s) ? STATUS_META[s].badge + ' font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700')}>
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5', STATUS_META[s].dot)} />
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Módulos com acesso</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MODULES.map(m => {
                const meta = MODULE_META[m]
                return (
                  <button key={m} onClick={() => toggleModule(m)}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors',
                      filterModule.includes(m) ? meta.bg + ' ' + meta.color
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700')}>
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={11} /> Data de cadastro
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-700 dark:text-slate-200" />
              <span className="text-xs text-slate-400">até</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-violet-400 text-slate-700 dark:text-slate-200" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-300 hover:text-slate-500"><X size={13} /></button>
              )}
            </div>
          </div>

          {hasFilter && (
            <div className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-3">
              <button onClick={clearFilters}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline underline-offset-2">
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl gap-3 text-center">
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400"><Search size={24} /></div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">

          {/* Cabeçalho desktop */}
          <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
            <SortHeader field="name"        label="Usuário"      current={sortField} dir={sortDir} onSort={toggleSort} />
            <SortHeader field="primaryRole" label="Perfil"       current={sortField} dir={sortDir} onSort={toggleSort} />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Módulos</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Acessos</span>
            <SortHeader field="status"      label="Status"       current={sortField} dir={sortDir} onSort={toggleSort} center />
            <SortHeader field="createdAt"   label="Cadastro"     current={sortField} dir={sortDir} onSort={toggleSort} />
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginated.map(u => {
              const sttMeta = STATUS_META[u.status]
              const isExp = expanded === u.id
              const detail = detailCache[u.id]

              return (
                <div key={u.id}>
                  {/* Linha principal desktop */}
                  <div
                    className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_auto_auto_auto] gap-4 items-center px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => expand(u.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                        {initials(u.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{u.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{u.primaryRole}</p>
                    <div className="flex flex-wrap gap-1">
                      {u.modules.map(m => {
                        const meta = MODULE_META[m]
                        return (
                          <span key={m} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', meta.bg, meta.color)}>
                            {meta.label}
                          </span>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
                      <MapPin size={11} />
                      {u.municipalityCount} · {u.facilityCount}
                    </div>
                    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border', sttMeta.badge)}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', sttMeta.dot)} />
                      {sttMeta.label}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
                      <span>{fmtIso(u.createdAt)}</span>
                      {isExp ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                    </div>
                  </div>

                  {/* Card mobile */}
                  <div className="lg:hidden px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" onClick={() => expand(u.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                        {initials(u.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{u.name}</p>
                        <p className="text-xs text-slate-400 truncate">{u.primaryRole}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', sttMeta.badge)}>
                          <span className={cn('w-1 h-1 rounded-full', sttMeta.dot)} />
                          {sttMeta.label}
                        </span>
                        {isExp ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2 ml-12">
                      {u.modules.map(m => {
                        const meta = MODULE_META[m]
                        return (
                          <span key={m} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', meta.bg, meta.color)}>
                            {meta.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {/* Detalhe expandido (usa detailCache) */}
                  {isExp && (
                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 px-5 py-4 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <DetailField label="Nome de acesso" value={u.login} />
                        <DetailField label="CPF"       value={u.cpf} />
                        <DetailField label="Telefone"  value={u.phone || '—'} />
                        <DetailField label="Cadastro"  value={fmtIso(u.createdAt)} />
                      </div>

                      <div className="border-t border-slate-100 dark:border-slate-800" />

                      {detail ? (
                        <div className="space-y-3">
                          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin size={11} /> Municípios e unidades
                          </p>
                          {detail.municipalities.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Sem vínculos.</p>
                          ) : detail.municipalities.map(mun => (
                            <div key={mun.municipalityId} className="space-y-2">
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                <MapPin size={11} className="text-violet-400" />
                                {mun.municipalityName}
                                <span className="text-[10px] text-slate-400">· {mun.municipalityState}</span>
                              </p>
                              <div className="space-y-1.5 ml-4">
                                {mun.facilities.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">Sem unidades.</p>
                                ) : mun.facilities.map(fac => (
                                  <div key={fac.facilityId} className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-[160px]">
                                      <Building2 size={11} className="shrink-0" />
                                      <span className="truncate">{fac.facilityShortName}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 italic">{fac.role}</span>
                                    <div className="flex gap-1">
                                      {fac.modules.map(m => {
                                        const meta = MODULE_META[m as string]
                                        if (!meta) return null
                                        return (
                                          <span key={m} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', meta.bg, meta.color)}>
                                            {meta.label}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Carregando acessos...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Paginação */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/20">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} usuário{filtered.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">por página:</span>
                {[10, 20, 50].map(s => (
                  <button key={s} onClick={() => { setPageSize(s); setPage(1) }}
                    className={cn('px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                      pageSize === s ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800">
                <ChevronDown size={13} className="rotate-90" />
              </button>
              <span className="text-xs text-slate-500 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800">
                <ChevronDown size={13} className="-rotate-90" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, iconBg, iconColor, valueColor }: {
  icon: React.ReactNode; label: string; value: number
  iconBg: string; iconColor: string; valueColor: string
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3">
      <div className={cn('p-2 rounded-xl shrink-0', iconBg, iconColor)}>{icon}</div>
      <div>
        <p className={cn('text-2xl font-bold leading-none', valueColor)}>{value}</p>
        <p className="text-[11px] text-slate-400 mt-1 leading-tight">{label}</p>
      </div>
    </div>
  )
}

function SortHeader({ field, label, current, dir, onSort, center }: {
  field: SortField; label: string; current: SortField; dir: SortDir
  onSort: (f: SortField) => void; center?: boolean
}) {
  const active = field === current
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-200 transition-colors',
        center && 'justify-center w-full',
      )}
    >
      {label}
      {active
        ? dir === 'asc' ? <ChevronUp size={11} className="text-violet-500" /> : <ChevronDown size={11} className="text-violet-500" />
        : <ChevronsUpDown size={11} className="opacity-40" />}
    </button>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  )
}
