import { useState, useEffect } from 'react'
import { X, Search, Clock, Wifi, WifiOff } from 'lucide-react'
import { mockAllUsersPresence } from '../../mock/users'
import type { UserPresence } from '../../mock/users'
import { initials, cn } from '../../lib/utils'

const SYSTEM_COLORS: Record<string, string> = {
  CLN: '#0ea5e9',
  DGN: '#8b5cf6',
  HSP: '#f59e0b',
  PLN: '#10b981',
  FSC: '#f97316',
  OPS: '#6b7280',
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1)  return 'agora mesmo'
  if (diffMins < 60) return `há ${diffMins}min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `há ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `há ${diffDays}d`
}

interface Props {
  open: boolean
  onClose: () => void
  highlightId?: string
}

export function UsersPanel({ open, onClose, highlightId }: Props) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'online' | 'offline'>('all')

  // Reset search when closing
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const online  = mockAllUsersPresence.filter(u => u.online)
  const offline = mockAllUsersPresence.filter(u => !u.online)

  const filtered = mockAllUsersPresence.filter(u => {
    const matchesTab =
      tab === 'all' ? true :
      tab === 'online'  ? u.online :
      !u.online
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      u.name.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.unit.toLowerCase().includes(q) ||
      u.system.toLowerCase().includes(q)
    return matchesTab && matchesSearch
  })

  const filteredOnline  = filtered.filter(u => u.online)
  const filteredOffline = filtered.filter(u => !u.online)

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Usuários do Sistema</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex-1 flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl px-3 py-2.5">
            <Wifi size={14} className="text-emerald-500 shrink-0" />
            <div>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-none">{online.length}</p>
              <p className="text-[10px] text-emerald-600/70 dark:text-emerald-500/70 mt-0.5">Online agora</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2.5">
            <WifiOff size={14} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-lg font-bold text-slate-600 dark:text-slate-300 leading-none">{offline.length}</p>
              <p className="text-[10px] text-slate-500/70 mt-0.5">Offline</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-2.5 bg-sky-50 dark:bg-sky-950/30 rounded-xl px-3 py-2.5">
            <div>
              <p className="text-lg font-bold text-sky-600 dark:text-sky-400 leading-none">{mockAllUsersPresence.length}</p>
              <p className="text-[10px] text-sky-600/70 dark:text-sky-500/70 mt-0.5">Total</p>
            </div>
          </div>
        </div>

        {/* Search + Tabs */}
        <div className="px-4 pt-3 pb-2 space-y-2.5 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, cargo, unidade..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-sky-400 focus:bg-white dark:focus:bg-slate-700 rounded-lg outline-none transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400"
            />
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {([['all', 'Todos'], ['online', 'Online'], ['offline', 'Offline']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors',
                  tab === key
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                {label}
                {key === 'online' && (
                  <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-emerald-500 text-white rounded-full">{online.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 pb-4">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400">
              <Search size={24} className="mb-2 opacity-40" />
              <p className="text-xs">Nenhum usuário encontrado</p>
            </div>
          )}

          {(tab === 'all' || tab === 'online') && filteredOnline.length > 0 && (
            <div className="mb-4">
              {tab === 'all' && (
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Online agora
                </p>
              )}
              <div className="space-y-1">
                {filteredOnline.map(u => (
                  <UserRow key={u.id} user={u} highlighted={u.id === highlightId} />
                ))}
              </div>
            </div>
          )}

          {(tab === 'all' || tab === 'offline') && filteredOffline.length > 0 && (
            <div>
              {tab === 'all' && (
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                  Offline
                </p>
              )}
              <div className="space-y-1">
                {filteredOffline.map(u => (
                  <UserRow key={u.id} user={u} highlighted={u.id === highlightId} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function UserRow({ user, highlighted }: { user: UserPresence; highlighted: boolean }) {
  const color = SYSTEM_COLORS[user.system] ?? '#6b7280'

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
      highlighted
        ? 'bg-sky-50 dark:bg-sky-950/30 ring-1 ring-sky-200 dark:ring-sky-800'
        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
    )}>
      {/* Avatar */}
      <div className="relative shrink-0">
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

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user.role} · {user.unit}</p>
      </div>

      {/* System + Status */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ backgroundColor: color + '18', color }}
        >
          {user.system}
        </span>
        {user.online ? (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-500 inline-block" />
            desde {user.since}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock size={9} />
            {user.lastSeenAt ? formatRelativeTime(user.lastSeenAt) : '—'}
          </span>
        )}
      </div>
    </div>
  )
}
