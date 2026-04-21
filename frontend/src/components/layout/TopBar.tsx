import { useState, useRef, useEffect } from 'react'
import { Bell, Users, ChevronDown, Check, Sun, Moon, LogOut, User, Building2, Shield, ArrowRight, Menu, AlertCircle, AlertTriangle, CheckCircle, Info, MapPin, LayoutGrid, KeyRound, Cake, Stethoscope } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { useUIStore } from '../../store/uiStore'
import { useTheme } from '../../hooks/useTheme'
import { SYSTEMS } from '../../mock/users'
import { sessionsApi, type PresenceItem } from '../../api/sessions'
import { initials, formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { AccessibilityMenu } from '../ui/AccessibilityMenu'
import { NotificationDetailModal } from '../ui/NotificationDetailModal'
import { UserAvatar } from '../shared/UserAvatar'
import type { SystemId } from '../../types'

const MODULE_COLORS: Record<SystemId, string> = {
  cln: '#0ea5e9', dgn: '#8b5cf6', hsp: '#f59e0b',
  pln: '#10b981', fsc: '#f97316', ops: '#6b7280',
  ind: '#ec4899', cha: '#14b8a6', esu: '#6366f1',
}

interface Props {
  module: SystemId | null
  /** Quando ``true``, mostra o ícone de bolo pra reabrir o modal de aniversário. */
  birthday?: boolean
  onBirthdayClick?: () => void
}

export function TopBar({ module, birthday, onBirthdayClick }: Props) {
  const { user, context, contextOptions, logout } = useAuthStore()
  const can = useAuthStore(s => s.can)
  const canManageRoles = can('roles.role.view')
  const { notifications, unreadCount, markRead, markAllRead, refresh, refreshCount } = useNotificationStore()

  // Polling: lista completa no mount, e só o count em seguida pra ficar leve.
  // Cadência 30s (inbox é menos "ao vivo" que presença).
  useEffect(() => {
    void refresh()
    const id = setInterval(() => { void refreshCount() }, 30_000)
    return () => clearInterval(id)
  }, [refresh, refreshCount])
  const { openMobileSidebar } = useUIStore()
  const { theme, toggle: toggleDarkMode } = useTheme()
  const darkMode = theme === 'dark'
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen]     = useState(false)
  const [selectedNotif, setSelectedNotif] = useState<string | null>(null)
  const [usersOpen, setUsersOpen]     = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const [onlineUsers, setOnlineUsers] = useState<PresenceItem[]>([])

  // Quando o usuário está dentro de um contexto (módulo numa unidade),
  // o widget mostra presença daquele município. Fora de contexto (shell
  // /sys), mostra o total do escopo do ator. Mantém consistência com o
  // filtro default da UsersPage.
  const munFilterForPresence = context?.municipality.id ?? null

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const list = await sessionsApi.presence('actor', munFilterForPresence)
        if (alive) setOnlineUsers(list)
      } catch { /* silencioso — presença não quebra topbar */ }
    }
    void load()
    const id = setInterval(load, 15_000)
    return () => { alive = false; clearInterval(id) }
  }, [munFilterForPresence])

  const goToUsers = () => {
    setUsersOpen(false)
    navigate('/usuarios')
  }

  const accentColor = module ? MODULE_COLORS[module] : '#0ea5e9'

  const available = context?.modules?.length
    ? SYSTEMS.filter(s => context.modules.includes(s.id))
    : SYSTEMS
  const canSwitchModule = available.length > 1
  // "Trocar contexto" vale pra qualquer mudança de (município, unidade,
  // vínculo CBO). Aparece quando há mais de uma linha selecionável —
  // cada binding conta como uma linha distinta na tela de seleção.
  const totalContextRows = (contextOptions?.municipalities ?? []).reduce(
    (s, m) => s + m.facilities.reduce(
      (ss, f) => ss + Math.max(1, f.cnesBindings.length), 0,
    ), 0,
  )
  const canSwitchContext = totalContextRows > 1

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

      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-2 shrink-0 relative">
        {module && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] opacity-50" style={{ backgroundColor: accentColor }} />
        )}

        {/* Hamburger — só no mobile */}
        <button
          onClick={openMobileSidebar}
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Menu size={18} />
        </button>

        <div className="flex-1" />

        {/* Online users — oculto em mobile */}
        <div className="relative z-50 hidden sm:block">
          <button
            onClick={() => { setUsersOpen(v => !v); setNotifOpen(false) }}
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-medium"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Users size={14} />
            {onlineUsers.length} online
          </button>

          {usersOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50">

              {/* Header do dropdown */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Sessões ativas</p>
                  <span className="text-[10px] font-bold bg-emerald-500 text-white rounded-full px-1.5 py-0.5 leading-none">{onlineUsers.length}</span>
                </div>
                <button
                  onClick={() => goToUsers()}
                  className="text-[10px] text-sky-500 hover:text-sky-700 font-medium flex items-center gap-1 transition-colors"
                >
                  Ver todos <ArrowRight size={10} />
                </button>
              </div>

              {/* Lista online (scrollável) */}
              <div className="overflow-y-auto scrollbar-thin divide-y divide-slate-50 dark:divide-slate-800/60" style={{ maxHeight: '240px' }}>
                {onlineUsers.length === 0 ? (
                  <p className="px-4 py-8 text-xs text-center text-slate-400">
                    Ninguém online agora.
                  </p>
                ) : onlineUsers.map(u => {
                  const since = new Date(u.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <button
                      key={u.sessionId}
                      onClick={() => goToUsers()}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <div className="relative shrink-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-sky-500">
                          {initials(u.userName)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{u.userName}</p>
                        <p className="text-[10px] text-slate-400 truncate">{u.primaryRole}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 truncate max-w-[100px]">{u.ip || '—'}</span>
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400">desde {since}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Rodapé */}
              <button
                onClick={() => goToUsers()}
                className="w-full flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="text-[11px] text-slate-500">Ver todos os usuários e histórico</span>
                <ArrowRight size={11} className="text-sky-500" />
              </button>
            </div>
          )}
        </div>

        {/* Aniversário — só aparece no dia */}
        {birthday && (
          <button
            type="button"
            onClick={onBirthdayClick}
            title="Hoje é seu aniversário! 🎉"
            aria-label="Abrir mensagem de aniversário"
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-pink-500 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors"
          >
            <Cake size={16} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
          </button>
        )}

        {/* Acessibilidade */}
        <AccessibilityMenu />

        {/* Notifications */}
        <div className="relative z-50">
          <button
            onClick={() => {
              setNotifOpen(v => { if (!v) void refresh(); return !v })
              setUsersOpen(false)
            }}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50">

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Notificações</p>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">{unreadCount}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); markAllRead() }}
                      className="text-[10px] text-sky-500 hover:text-sky-700 font-medium flex items-center gap-1 transition-colors"
                    >
                      <Check size={11} /> Marcar todas
                    </button>
                  )}
                  <button
                    onClick={() => { setNotifOpen(false); navigate('/notificacoes') }}
                    className="text-[10px] text-sky-500 hover:text-sky-700 font-medium flex items-center gap-1 transition-colors"
                  >
                    Ver todas <ArrowRight size={10} />
                  </button>
                </div>
              </div>

              {/* Lista (scrollável) */}
              <div className="overflow-y-auto scrollbar-thin divide-y divide-slate-50 dark:divide-slate-800/60" style={{ maxHeight: '320px' }}>
                {notifications.slice(0, 8).map(n => {
                  const Icon =
                    n.type === 'error'   ? AlertCircle :
                    n.type === 'warning' ? AlertTriangle :
                    n.type === 'success' ? CheckCircle : Info
                  const color =
                    n.type === 'error'   ? '#ef4444' :
                    n.type === 'warning' ? '#f59e0b' :
                    n.type === 'success' ? '#10b981' : '#0ea5e9'
                  return (
                    <button
                      key={n.id}
                      onClick={() => { setSelectedNotif(n.id); setNotifOpen(false) }}
                      className={cn(
                        'w-full flex gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors',
                        !n.read && 'bg-sky-50/40 dark:bg-sky-950/20'
                      )}
                    >
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: color + '15', color }}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <p className={cn('text-xs leading-snug truncate', n.read ? 'font-medium text-slate-600 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-white')}>
                            {n.title}
                          </p>
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 mt-1" />}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => { setNotifOpen(false); navigate('/notificacoes') }}
                  className="w-full text-center text-[11px] text-sky-500 hover:text-sky-700 font-medium transition-colors"
                >
                  Ver todas as {notifications.length} notificações
                </button>
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
            {user
              ? <UserAvatar
                  userId={user.id}
                  userName={user.name}
                  photoId={user.currentPhotoId}
                  className="w-7 h-7"
                  initialsClassName="text-xs"
                />
              : <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white">U</div>}
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {user?.name?.split(' ')[0]}
            </span>
            <ChevronDown size={12} className={cn('text-slate-400 transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl">
              {/* User header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  {user
                    ? <UserAvatar
                        userId={user.id}
                        userName={user.name}
                        photoId={user.currentPhotoId}
                        className="w-11 h-11"
                        initialsClassName="text-sm"
                      />
                    : <div className="w-11 h-11 rounded-full bg-sky-500 flex items-center justify-center text-sm font-bold text-white shrink-0">U</div>}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{user?.email}</p>
                  </div>
                </div>
              </div>

              {/* Contexto ativo */}
              {context && (
                <div className="p-3 space-y-1 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Contexto ativo</p>
                  <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                    <User size={13} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400">Perfil</p>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{context.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                    <Building2 size={13} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400">Unidade</p>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{context.facility.shortName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                    <MapPin size={13} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400">Município</p>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{context.municipality.name} · {context.municipality.state}</p>
                    </div>
                  </div>
                  {context.cboBinding && (
                    <div className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg">
                      <Stethoscope size={13} className="text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400">Vínculo CNES</p>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                          {context.cboBinding.cnesSnapshotNome || 'Profissional'}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          CBO {context.cboBinding.cboId} · {context.cboBinding.cboDescription || '—'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

              {/* Ações */}
              <div className="p-2 space-y-0.5">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/minha-conta') }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <User size={14} />
                  Minha conta
                </button>
                {canSwitchModule && (
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/selecionar-sistema') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <LayoutGrid size={14} />
                    Trocar módulo
                  </button>
                )}
                {canSwitchContext && (
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/selecionar-contexto') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <MapPin size={14} />
                    Trocar contexto
                  </button>
                )}
                {canManageRoles && (
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/shared/perfis') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <KeyRound size={14} />
                    Perfis & permissões
                  </button>
                )}
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

      <NotificationDetailModal
        notificationId={selectedNotif}
        onClose={() => setSelectedNotif(null)}
      />
    </>
  )
}
