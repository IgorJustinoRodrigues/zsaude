import { useState } from 'react'
import { Search, Wifi, WifiOff, Clock } from 'lucide-react'
import { mockAllUsersPresence } from '../../mock/users'
import type { UserPresence } from '../../mock/users'
import { initials, normalize, cn } from '../../lib/utils'

const SYSTEM_COLORS: Record<string, string> = {
  CLN: '#0ea5e9', DGN: '#8b5cf6', HSP: '#f59e0b',
  PLN: '#10b981', FSC: '#f97316', OPS: '#6b7280',
}

function formatRelativeTime(date: Date): string {
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (diffMins < 1)  return 'agora mesmo'
  if (diffMins < 60) return `há ${diffMins}min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `há ${diffHours}h`
  return `há ${Math.floor(diffHours / 24)}d`
}

export function UsersPage() {
  const [search, setSearch] = useState('')
  const [tab, setTab]       = useState<'all' | 'online' | 'offline'>('all')

  const online  = mockAllUsersPresence.filter(u => u.online)
  const offline = mockAllUsersPresence.filter(u => !u.online)

  const filtered = mockAllUsersPresence.filter(u => {
    const matchTab =
      tab === 'online' ? u.online :
      tab === 'offline' ? !u.online : true
    const q = normalize(search)
    return matchTab && (!q ||
      normalize(u.name).includes(q) ||
      normalize(u.role).includes(q) ||
      normalize(u.unit).includes(q) ||
      normalize(u.system).includes(q)
    )
  })

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Usuários do sistema</h1>
        <p className="text-sm text-slate-500 mt-0.5">Sessões ativas e histórico de acesso</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
            <Wifi size={14} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-none">{online.length}</p>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Online agora</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <WifiOff size={14} className="text-slate-400" />
          </div>
          <div>
            <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-none">{offline.length}</p>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Offline</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-sky-500">{mockAllUsersPresence.length}</span>
          </div>
          <div>
            <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-none">{mockAllUsersPresence.length}</p>
            <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">Total</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, cargo, unidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400"
          />
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          {([['all', 'Todos'], ['online', 'Online'], ['offline', 'Offline']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                tab === key
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              )}
            >
              {label}
              {key === 'online' && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-emerald-500 text-white rounded-full">{online.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista: cards no mobile, tabela no desktop */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <Search size={28} className="mb-2 opacity-30" />
          <p className="text-sm">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <>
          {/* Mobile / tablet: cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
            {filtered.map(u => <UserCard key={u.id} user={u} />)}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="w-8" />
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Usuário</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unidade</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Módulo</p>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(u => <UserRow key={u.id} user={u} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* Card para mobile/tablet */
function UserCard({ user }: { user: UserPresence }) {
  const color = SYSTEM_COLORS[user.system] ?? '#6b7280'
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-start gap-3">
      <div className="relative shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {initials(user.name)}
        </div>
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900',
          user.online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
            style={{ backgroundColor: color + '18', color }}
          >
            {user.system}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{user.role} · {user.unit}</p>
        <div className="mt-2">
          {user.online ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Online</span>
              <span className="text-[10px] text-slate-400">desde {user.since}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock size={11} />
              <span className="text-xs">{user.lastSeenAt ? formatRelativeTime(user.lastSeenAt) : '—'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* Row para desktop */
function UserRow({ user }: { user: UserPresence }) {
  const color = SYSTEM_COLORS[user.system] ?? '#6b7280'
  return (
    <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <div className="relative w-8 h-8 shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {initials(user.name)}
        </div>
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900',
          user.online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
        )} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
        <p className="text-xs text-slate-500 truncate">{user.role}</p>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{user.unit}</p>
      <span
        className="text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap"
        style={{ backgroundColor: color + '18', color }}
      >
        {user.system}
      </span>
      {user.online ? (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Online</span>
          <span className="text-[10px] text-slate-400">desde {user.since}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock size={12} className="text-slate-400" />
          <span className="text-xs text-slate-500">{user.lastSeenAt ? formatRelativeTime(user.lastSeenAt) : '—'}</span>
        </div>
      )}
    </div>
  )
}
