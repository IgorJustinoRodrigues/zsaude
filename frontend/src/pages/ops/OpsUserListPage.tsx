import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, UserPlus, ChevronUp, ChevronDown, ChevronsUpDown,
  Eye, Pencil, Users, UserCheck, UserX, ShieldOff,
  Filter, X, ChevronLeft, ChevronRight, Cake,
} from 'lucide-react'
import { initials, cn } from '../../lib/utils'
import { userApi, type UserListItem, type UserStats, type UserStatus } from '../../api/users'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { BirthdaysPanel } from '../../components/shared/BirthdaysPanel'
import type { SystemId } from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODULE_COLOR: Record<string, string> = {
  cln: '#0ea5e9', dgn: '#8b5cf6', hsp: '#f59e0b',
  pln: '#10b981', fsc: '#f97316', ops: '#6b7280',
}
const MODULE_LABEL: Record<string, string> = {
  cln: 'CLN', dgn: 'DGN', hsp: 'HSP', pln: 'PLN', fsc: 'FSC', ops: 'OPS',
}

const STATUS_STYLE: Record<UserStatus, string> = {
  Ativo:    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  Inativo:  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  Bloqueado:'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
}

type SortField = 'name' | 'primaryRole' | 'status' | 'createdAt'
type SortDir   = 'asc' | 'desc'

const PAGE_SIZE = 20

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'users' | 'birthdays'

export function OpsUserListPage() {
  const navigate = useNavigate()
  const context = useAuthStore(s => s.context)
  const [tab, setTab] = useState<Tab>('users')

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [status, setStatus] = useState<UserStatus | 'Todos'>('Todos')
  const [moduleFilter, setModuleFilter] = useState<SystemId | 'Todos'>('Todos')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(1)

  const [stats, setStats] = useState<UserStats | null>(null)
  const [items, setItems] = useState<UserListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Reset de página quando filtros mudam
  useEffect(() => { setPage(1) }, [debouncedSearch, status, moduleFilter])

  // Carrega stats uma vez
  useEffect(() => {
    userApi.stats().then(setStats).catch(() => {})
  }, [])

  // Carrega lista ao mudar filtro/página
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await userApi.list({
        search: debouncedSearch || undefined,
        status: status === 'Todos' ? undefined : status,
        module: moduleFilter === 'Todos' ? undefined : moduleFilter,
        page,
        pageSize: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (e) {
      let msg = 'Não foi possível carregar os usuários.'
      if (e instanceof HttpError && e.status === 403) {
        msg = 'Apenas administradores podem listar usuários.'
      }
      setError(msg)
      toast.error('Falha ao carregar', msg)
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, status, moduleFilter, page])

  useEffect(() => { void reload() }, [reload])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const sorted = useMemo(() => {
    // Ordenação client-side sobre a página atual — backend já ordena por name
    const list = [...items]
    list.sort((a, b) => {
      let va: string = '', vb: string = ''
      if (sortField === 'createdAt') { va = a.createdAt; vb = b.createdAt }
      else if (sortField === 'status') { va = a.status; vb = b.status }
      else if (sortField === 'primaryRole') { va = a.primaryRole; vb = b.primaryRole }
      else { va = a.name; vb = b.name }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [items, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir(field === 'createdAt' ? 'desc' : 'asc') }
  }

  const hasFilter = status !== 'Todos' || moduleFilter !== 'Todos'

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Usuários</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {stats ? `${stats.total} usuários cadastrados` : 'Carregando...'}
          </p>
        </div>
        {tab === 'users' && (
          <button
            onClick={() => navigate('/ops/usuarios/novo')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors shrink-0"
          >
            <UserPlus size={15} />
            Novo usuário
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-1">
        <button
          onClick={() => setTab('users')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'users'
              ? 'border-sky-500 text-sky-700 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
          )}
        >
          <Users size={14} />
          Usuários
        </button>
        <button
          onClick={() => setTab('birthdays')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'birthdays'
              ? 'border-sky-500 text-sky-700 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
          )}
        >
          <Cake size={14} />
          Aniversariantes
        </button>
      </div>

      {/* Aniversariantes do município ativo */}
      {tab === 'birthdays' && (
        <>
          {context?.municipality && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aniversariantes vinculados a{' '}
              <strong>{context.municipality.name}/{context.municipality.state}</strong>.
            </p>
          )}
          <BirthdaysPanel
            viewBasePath="/ops/usuarios"
            accent="sky"
            municipalityId={context?.municipality.id}
          />
        </>
      )}

      {/* Resto só aparece na tab "Usuários" */}
      {tab === 'users' && (
      <>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={<Users size={14} className="text-slate-400" />} bg="bg-slate-100 dark:bg-slate-800" label="Total" value={stats?.total ?? 0} />
        <SummaryCard icon={<UserCheck size={14} className="text-emerald-500" />} bg="bg-emerald-50 dark:bg-emerald-950/40" label="Ativos" value={stats?.ativo ?? 0} />
        <SummaryCard icon={<UserX size={14} className="text-slate-400" />} bg="bg-slate-100 dark:bg-slate-800" label="Inativos" value={stats?.inativo ?? 0} />
        <SummaryCard icon={<ShieldOff size={14} className="text-red-500" />} bg="bg-red-50 dark:bg-red-950/40" label="Bloqueados" value={stats?.bloqueado ?? 0} />
      </div>

      {/* Barra de busca e filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail, CPF ou perfil..."
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
              {(status !== 'Todos' ? 1 : 0) + (moduleFilter !== 'Todos' ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilter && (
        <div className="flex flex-wrap gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</label>
            <div className="flex gap-1">
              {(['Todos', 'Ativo', 'Inativo', 'Bloqueado'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    status === s
                      ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
                  )}
                >{s}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Módulo</label>
            <div className="flex flex-wrap gap-1">
              {(['Todos', 'cln', 'dgn', 'hsp', 'pln', 'fsc', 'ops'] as const).map(mod => (
                <button
                  key={mod}
                  onClick={() => setModuleFilter(mod)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    moduleFilter === mod
                      ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
                  )}
                >
                  {mod === 'Todos' ? 'Todos' : MODULE_LABEL[mod]}
                </button>
              ))}
            </div>
          </div>
          {hasFilter && (
            <button
              onClick={() => { setStatus('Todos'); setModuleFilter('Todos') }}
              className="self-end text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Resultado */}
      {loading ? (
        <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <svg className="animate-spin w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="lg:hidden space-y-2">
            {sorted.map(u => (
              <MobileCard
                key={u.id} user={u}
                onView={() => navigate(`/ops/usuarios/${u.id}`)}
                onEdit={() => navigate(`/ops/usuarios/${u.id}/editar`)}
              />
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th sortable field="name" current={sortField} dir={sortDir} onSort={toggleSort}>Usuário</Th>
                  <Th sortable field="primaryRole" current={sortField} dir={sortDir} onSort={toggleSort}>Perfil</Th>
                  <Th>Municípios</Th>
                  <Th>Módulos</Th>
                  <Th sortable field="status" current={sortField} dir={sortDir} onSort={toggleSort}>Status</Th>
                  <Th sortable field="createdAt" current={sortField} dir={sortDir} onSort={toggleSort}>Cadastro</Th>
                  <th className="px-4 py-2.5 text-right">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map(u => (
                  <TableRow
                    key={u.id} user={u}
                    onView={() => navigate(`/ops/usuarios/${u.id}`)}
                    onEdit={() => navigate(`/ops/usuarios/${u.id}/editar`)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="px-2 text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </>
      )}

      </>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SummaryCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 md:p-4 flex items-center gap-3">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bg)}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-slate-900 dark:text-white leading-none">{value}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function Th({ children, sortable, field, current, dir, onSort }: {
  children?: React.ReactNode; sortable?: boolean
  field?: SortField; current?: SortField; dir?: SortDir
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

function TableRow({ user, onView, onEdit }: { user: UserListItem; onView: () => void; onEdit: () => void }) {
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-[180px]">{user.primaryRole}</p>
        <p className="text-xs text-slate-400">{user.cpf}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{user.municipalityCount} município{user.municipalityCount !== 1 ? 's' : ''}</span>
          <span className="text-slate-300">·</span>
          <span>{user.facilityCount} unidade{user.facilityCount !== 1 ? 's' : ''}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {user.modules.map(mod => (
            <span
              key={mod}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: MODULE_COLOR[mod] + '1a', color: MODULE_COLOR[mod] }}
            >
              {MODULE_LABEL[mod]}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_STYLE[user.status])}>
          {user.status}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <ActionBtn icon={<Eye size={14} />} title="Ver detalhes" onClick={onView} />
          <ActionBtn icon={<Pencil size={14} />} title="Editar" onClick={onEdit} />
        </div>
      </td>
    </tr>
  )
}

function MobileCard({ user, onView, onEdit }: { user: UserListItem; onView: () => void; onEdit: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
        {initials(user.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', STATUS_STYLE[user.status])}>
            {user.status}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">{user.primaryRole} · {user.cpf}</p>
        <p className="text-xs text-slate-400 truncate mt-0.5">
          {user.municipalityCount} município{user.municipalityCount !== 1 ? 's' : ''} · {user.facilityCount} unidade{user.facilityCount !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1">
            {user.modules.map(mod => (
              <span
                key={mod}
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: MODULE_COLOR[mod] + '1a', color: MODULE_COLOR[mod] }}
              >
                {MODULE_LABEL[mod]}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <ActionBtn icon={<Eye size={14} />} title="Ver" onClick={onView} />
            <ActionBtn icon={<Pencil size={14} />} title="Editar" onClick={onEdit} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {icon}
    </button>
  )
}
