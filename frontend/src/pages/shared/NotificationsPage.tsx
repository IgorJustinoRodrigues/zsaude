import { useState } from 'react'
import { Bell, BellOff, AlertCircle, AlertTriangle, CheckCircle, Info, Check } from 'lucide-react'
import { useNotificationStore } from '../../store/notificationStore'
import { cn } from '../../lib/utils'
import type { NotificationType } from '../../types'

const TYPE_META: Record<NotificationType, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  error:   { icon: <AlertCircle size={15} />,   label: 'Erro',    color: '#ef4444', bg: '#fef2f2' },
  warning: { icon: <AlertTriangle size={15} />, label: 'Aviso',   color: '#f59e0b', bg: '#fffbeb' },
  success: { icon: <CheckCircle size={15} />,   label: 'Sucesso', color: '#10b981', bg: '#f0fdf4' },
  info:    { icon: <Info size={15} />,           label: 'Info',    color: '#0ea5e9', bg: '#f0f9ff' },
}

const TYPE_META_DARK: Record<NotificationType, string> = {
  error: '#7f1d1d', warning: '#78350f', success: '#14532d', info: '#0c4a6e',
}

function formatRelativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1)   return 'agora mesmo'
  if (diffMin < 60)  return `há ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)    return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `há ${diffD}d`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationStore()
  const [tab, setTab]         = useState<'all' | 'unread' | 'read'>('all')
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all')

  const filtered = notifications.filter(n => {
    const matchTab  = tab === 'all' ? true : tab === 'unread' ? !n.read : n.read
    const matchType = typeFilter === 'all' || n.type === typeFilter
    return matchTab && matchType
  })

  const counts = {
    error:   notifications.filter(n => n.type === 'error').length,
    warning: notifications.filter(n => n.type === 'warning').length,
    success: notifications.filter(n => n.type === 'success').length,
    info:    notifications.filter(n => n.type === 'info').length,
  }

  return (
    <div className="space-y-4 md:space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Notificações</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 border border-sky-200 dark:border-sky-800 rounded-lg transition-colors"
          >
            <Check size={13} /> Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Cards de tipo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(TYPE_META) as [NotificationType, typeof TYPE_META[NotificationType]][]).map(([type, meta]) => (
          <button
            key={type}
            onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
              typeFilter === type
                ? 'ring-2'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700',
            )}
            style={typeFilter === type ? {
              backgroundColor: meta.bg,
              borderColor: meta.color + '60',
              ringColor: meta.color,
              outline: `2px solid ${meta.color}`,
            } : {}}
          >
            <div className="shrink-0" style={{ color: meta.color }}>{meta.icon}</div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white leading-none">{counts[type]}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{meta.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Tabs + lista */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-slate-100 dark:border-slate-800">
          {([
            ['all',    'Todas',      notifications.length],
            ['unread', 'Não lidas',  notifications.filter(n => !n.read).length],
            ['read',   'Lidas',      notifications.filter(n => n.read).length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
                tab === key
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              {label}
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                tab === key ? 'bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              )}>{count}</span>
            </button>
          ))}
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <BellOff size={28} className="mb-2 opacity-30" />
            <p className="text-sm">Nenhuma notificação</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filtered.map(n => {
              const meta = TYPE_META[n.type]
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    'flex gap-4 px-4 py-4 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 group',
                    !n.read && 'bg-sky-50/40 dark:bg-sky-950/20',
                  )}
                >
                  {/* Ícone */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: meta.bg, color: meta.color }}
                  >
                    {meta.icon}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <p className={cn(
                        'text-sm leading-snug',
                        n.read ? 'font-medium text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-white'
                      )}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Badge de tipo */}
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                          style={{ backgroundColor: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        {/* Não lida dot */}
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <p className="text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                      <span className="text-[10px] text-slate-400">·</span>
                      <p className="text-[10px] text-slate-400">{formatRelativeTime(n.createdAt)}</p>
                      {!n.read && (
                        <span className="text-[10px] text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          Clique para marcar como lida
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
