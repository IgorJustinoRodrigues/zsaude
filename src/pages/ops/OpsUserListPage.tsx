import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, UserPlus, ChevronUp, ChevronDown, ChevronsUpDown,
  Eye, Pencil, Users, UserCheck, UserX, ShieldOff,
  Filter, X,
} from 'lucide-react'
import { mockUsers, mockMunicipalities, type UserRecord, type UserStatus } from '../../mock/users'
import { initials, cn } from '../../lib/utils'

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

function allModules(user: UserRecord): string[] {
  const set = new Set<string>()
  user.municipalities.forEach(m => m.facilities.forEach(f => f.modules.forEach(mod => set.add(mod))))
  return [...set]
}

function municipalityNames(user: UserRecord): string[] {
  return user.municipalities.map(m => {
    const found = mockMunicipalities.find(mun => mun.id === m.municipalityId)
    return found?.name ?? m.municipalityId
  })
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortField = 'name' | 'email' | 'primaryRole' | 'status' | 'createdAt'
type SortDir   = 'asc' | 'desc'

function sortUsers(users: UserRecord[], field: SortField, dir: SortDir) {
  return [...users].sort((a, b) => {
    const va = a[field] ?? ''
    const vb = b[field] ?? ''
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OpsUserListPage() {
  const navigate = useNavigate()

  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState<UserStatus | 'Todos'>('Todos')
  const [moduleFilter, setModuleFilter] = useState<string>('Todos')
  const [sortField,  setSortField]  = useState<SortField>('name')
  const [sortDir,    setSortDir]    = useState<SortDir>('asc')
  const [showFilter, setShowFilter] = useState(false)

  const counts = useMemo(() => ({
    total:    mockUsers.length,
    ativo:    mockUsers.filter(u => u.status === 'Ativo').length,
    inativo:  mockUsers.filter(u => u.status === 'Inativo').length,
    bloqueado:mockUsers.filter(u => u.status === 'Bloqueado').length,
  }), [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const base = mockUsers.filter(u => {
      const matchStatus = status === 'Todos' || u.status === status
      const matchModule = moduleFilter === 'Todos' || allModules(u).includes(moduleFilter)
      const matchSearch = !q || [u.name, u.email, u.cpf, u.primaryRole].some(v => v.toLowerCase().includes(q))
      return matchStatus && matchModule && matchSearch
    })
    return sortUsers(base, sortField, sortDir)
  }, [search, status, moduleFilter, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const hasFilter = status !== 'Todos' || moduleFilter !== 'Todos'

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Usuários</h1>
          <p className="text-sm text-slate-500 mt-0.5">{counts.total} usuários cadastrados</p>
        </div>
        <button
          onClick={() => navigate('/ops/usuarios/novo')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors shrink-0"
        >
          <UserPlus size={15} />
          Novo usuário
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={<Users size={14} className="text-slate-400" />} bg="bg-slate-100 dark:bg-slate-800" label="Total" value={counts.total} />
        <SummaryCard icon={<UserCheck size={14} className="text-emerald-500" />} bg="bg-emerald-50 dark:bg-emerald-950/40" label="Ativos" value={counts.ativo} />
        <SummaryCard icon={<UserX size={14} className="text-slate-400" />} bg="bg-slate-100 dark:bg-slate-800" label="Inativos" value={counts.inativo} />
        <SummaryCard icon={<ShieldOff size={14} className="text-red-500" />} bg="bg-red-50 dark:bg-red-950/40" label="Bloqueados" value={counts.bloqueado} />
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

      {/* Resultado */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="lg:hidden space-y-2">
            {filtered.map(u => (
              <MobileCard key={u.id} user={u} onEdit={() => navigate(`/ops/usuarios/${u.id}`)} />
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <Th>Usuário</Th>
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
                {filtered.map(u => (
                  <TableRow key={u.id} user={u} onEdit={() => navigate(`/ops/usuarios/${u.id}`)} />
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
              <p className="text-xs text-slate-400">{filtered.length} de {counts.total} usuários</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

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

// ─── Th ───────────────────────────────────────────────────────────────────────

function Th({
  children, sortable, field, current, dir, onSort,
}: {
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
            : <ChevronsUpDown size={11} className="opacity-40" />
          }
        </button>
      ) : (
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</span>
      )}
    </th>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

function TableRow({ user, onEdit }: { user: UserRecord; onEdit: () => void }) {
  const mods = allModules(user)
  const muns = municipalityNames(user)

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      {/* Usuário */}
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
      {/* Perfil */}
      <td className="px-4 py-3">
        <p className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-[180px]">{user.primaryRole}</p>
        <p className="text-xs text-slate-400">{user.cpf}</p>
      </td>
      {/* Municípios */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          {muns.slice(0, 2).map(m => (
            <span key={m} className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{m}</span>
          ))}
          {muns.length > 2 && <span className="text-[10px] text-slate-400">+{muns.length - 2} mais</span>}
        </div>
      </td>
      {/* Módulos */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {mods.map(mod => (
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
      {/* Status */}
      <td className="px-4 py-3">
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_STYLE[user.status])}>
          {user.status}
        </span>
      </td>
      {/* Cadastro */}
      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
      </td>
      {/* Ações */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <ActionBtn icon={<Eye size={14} />} title="Ver detalhes" onClick={onEdit} />
          <ActionBtn icon={<Pencil size={14} />} title="Editar" onClick={onEdit} />
        </div>
      </td>
    </tr>
  )
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function MobileCard({ user, onEdit }: { user: UserRecord; onEdit: () => void }) {
  const mods = allModules(user)
  const muns = municipalityNames(user)
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
        <p className="text-xs text-slate-400 truncate mt-0.5">{muns.join(', ')}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1">
            {mods.map(mod => (
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
            <ActionBtn icon={<Eye size={14} />} title="Ver" onClick={onEdit} />
            <ActionBtn icon={<Pencil size={14} />} title="Editar" onClick={onEdit} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

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
