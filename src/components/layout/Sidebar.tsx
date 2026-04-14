import { useNavigate } from 'react-router-dom'
import {
  Stethoscope, FlaskConical, BedDouble, ShieldCheck,
  ClipboardCheck, Truck, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { initials } from '../../lib/utils'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'

const MODULE_META: Record<SystemId, { label: string; abbrev: string; icon: React.ReactNode; color: string }> = {
  ga:   { label: 'Clínica',     abbrev: 'CLN', icon: <Stethoscope size={18} />,   color: '#0ea5e9' },
  lab:  { label: 'Diagnóstico', abbrev: 'DGN', icon: <FlaskConical size={18} />,  color: '#8b5cf6' },
  aih:  { label: 'Hospitalar',  abbrev: 'HSP', icon: <BedDouble size={18} />,     color: '#f59e0b' },
  conv: { label: 'Planos',      abbrev: 'PLN', icon: <ShieldCheck size={18} />,   color: '#10b981' },
  visa: { label: 'Fiscal',      abbrev: 'FSC', icon: <ClipboardCheck size={18} />, color: '#f97316' },
  adm:  { label: 'Operações',   abbrev: 'OPS', icon: <Truck size={18} />,         color: '#6b7280' },
}

interface Props { module: SystemId | null }

export function Sidebar({ module }: Props) {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const meta = module ? MODULE_META[module] : null

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full flex flex-col transition-all duration-200 z-30 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center h-14 px-4 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-3', sidebarCollapsed && 'justify-center px-0')}>
        {!sidebarCollapsed && (
          <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex-1">
            z<span className="text-sky-500">Saúde</span>
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Current module */}
      {meta && (
        <div className={cn('mx-3 mt-3 mb-1 rounded-xl p-3 flex items-center gap-2.5', sidebarCollapsed && 'mx-2 justify-center')}
          style={{ backgroundColor: meta.color + '12' }}
        >
          <div className="shrink-0" style={{ color: meta.color }}>
            {meta.icon}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: meta.color }}>
                {meta.abbrev}
              </p>
              <p className="text-xs font-semibold text-slate-700 truncate">{meta.label}</p>
            </div>
          )}
        </div>
      )}

      {/* Nav area — future menu items go here */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {/* items will be added per module */}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-100 dark:border-slate-800 p-2 space-y-0.5 shrink-0">
        {/* User info */}
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-xs font-bold text-sky-600 dark:text-sky-400 shrink-0">
              {initials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{user.name.split(' ')[0]} {user.name.split(' ').slice(-1)[0]}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.role}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/selecionar-sistema')}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors',
            sidebarCollapsed && 'justify-center'
          )}
          title="Trocar módulo"
        >
          <LayoutGrid size={15} />
          {!sidebarCollapsed && 'Trocar módulo'}
        </button>

        <button
          onClick={logout}
          className={cn(
            'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors',
            sidebarCollapsed && 'justify-center'
          )}
          title="Sair"
        >
          <LogOut size={15} />
          {!sidebarCollapsed && 'Sair'}
        </button>
      </div>
    </aside>
  )
}
