import { useState, useRef, useEffect } from 'react'
import { Bell, Users, ChevronDown, Check, Sun, Moon, LogOut, User, Building2, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { useUIStore } from '../../store/uiStore'
import { mockOnlineUsers, SYSTEMS } from '../../mock/users'
import { initials, formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'

const MODULE_COLORS: Record<SystemId, string> = {
  ga: '#0ea5e9', lab: '#8b5cf6', aih: '#f59e0b',
  conv: '#10b981', visa: '#f97316', adm: '#6b7280',
}

interface Props { module: SystemId | null }

export function TopBar({ module }: Props) {
  const { user, logout } = useAuthStore()
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationStore()
  const { darkMode, toggleDarkMode } = useUIStore()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const accentColor = module ? MODULE_COLORS[module] : '#0ea5e9'

  const available = user?.systems?.length
    ? SYSTEMS.filter(s => user.systems.includes(s.id))
    : SYSTEMS

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelectModule = (id: SystemId) => {
    setUserMenuOpen(false)
    navigate(`/${id}`)
  }

  return (
    <>
      {(notifOpen || usersOpen) && (
        <div className="fixed inset-0 z-40" onClick={() => { setNotifOpen(false); setUsersOpen(false) }} />
      )}

      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-5 gap-3 shrink-0 z-30 relative">
        {module && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] opacity-50" style={{ backgroundColor: accentColor }} />
        )}

        <div className="flex-1" />

        {/* Online users */}
        <div className="relative z-50">
          <button
            onClick={() => { setUsersOpen(v => !v); setNotifOpen(false) }}
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-medium"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Users size={14} />
            {mockOnlineUsers.length} online
          </button>

          {usersOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuários online</p>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {mockOnlineUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <div className="relative shrink-0">
                      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {initials(u.name)}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-400">{u.role} · {u.system}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative z-50">
          <button
            onClick={() => { setNotifOpen(v => !v); setUsersOpen(false) }}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Notificações</p>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-sky-500 hover:text-sky-700 font-medium flex items-center gap-1">
                    <Check size={11} /> Marcar todas
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={cn('px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors', !n.read && 'bg-sky-50/50 dark:bg-sky-950/30')}
                  >
                    <div className="flex gap-3">
                      <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                        n.type === 'error' ? 'bg-red-500' :
                        n.type === 'warning' ? 'bg-amber-400' :
                        n.type === 'success' ? 'bg-emerald-500' : 'bg-sky-500'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{n.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1.5">{formatDateTime(n.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={darkMode ? 'Modo claro' : 'Modo escuro'}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

        {/* User menu */}
        <div ref={userMenuRef} className="relative z-50">
          <button
            onClick={() => { setUserMenuOpen(v => !v); setNotifOpen(false); setUsersOpen(false) }}
            className={cn(
              'flex items-center gap-2.5 h-8 pl-1 pr-2 rounded-lg transition-all',
              userMenuOpen
                ? 'bg-slate-100 dark:bg-slate-800'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
          >
            <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white">
              {user ? initials(user.name) : 'U'}
            </div>
            <div className="text-left hidden md:block">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">
                {user?.name?.split(' ')[0]} {user?.name?.split(' ').slice(-1)[0]}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{user?.role}</p>
            </div>
            <ChevronDown size={12} className={cn('text-slate-400 transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
              {/* User header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-sky-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {user ? initials(user.name) : 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{user?.email}</p>
                  </div>
                </div>
              </div>

              {/* Account details */}
              <div className="p-3 space-y-1 border-b border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Dados da conta</p>
                <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                  <User size={13} className="text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400">Perfil</p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{user?.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                  <Building2 size={13} className="text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-400">Unidade</p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{user?.unit}</p>
                  </div>
                </div>
              </div>

              {/* Access */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 px-2 mb-2">
                  <Shield size={11} className="text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Meu acesso</p>
                </div>
                <div className="flex flex-wrap gap-1.5 px-2">
                  {available.map(sys => (
                    <button
                      key={sys.id}
                      onClick={() => handleSelectModule(sys.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: sys.color + '12',
                        borderColor: sys.color + '30',
                        color: sys.color,
                      }}
                    >
                      {sys.abbrev}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logout */}
              <div className="p-2">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                >
                  <LogOut size={14} />
                  Sair da conta
                </button>
              </div>
            </div>
          )}
        </div>
      </header>
    </>
  )
}
