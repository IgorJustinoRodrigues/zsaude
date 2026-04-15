import { useNavigate, useLocation } from 'react-router-dom'
import {
  Stethoscope, FlaskConical, BedDouble, ShieldCheck,
  ClipboardCheck, Truck, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, X,
  LayoutDashboard,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { initials } from '../../lib/utils'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'

const MODULE_META: Record<SystemId, { label: string; abbrev: string; icon: React.ReactNode; color: string }> = {
  cln: { label: 'Clínica',     abbrev: 'CLN', icon: <Stethoscope size={18} />,    color: '#0ea5e9' },
  dgn: { label: 'Diagnóstico', abbrev: 'DGN', icon: <FlaskConical size={18} />,   color: '#8b5cf6' },
  hsp: { label: 'Hospitalar',  abbrev: 'HSP', icon: <BedDouble size={18} />,      color: '#f59e0b' },
  pln: { label: 'Planos',      abbrev: 'PLN', icon: <ShieldCheck size={18} />,    color: '#10b981' },
  fsc: { label: 'Fiscal',      abbrev: 'FSC', icon: <ClipboardCheck size={18} />, color: '#f97316' },
  ops: { label: 'Operações',   abbrev: 'OPS', icon: <Truck size={18} />,          color: '#6b7280' },
}

interface Props { module: SystemId | null }

export function Sidebar({ module }: Props) {
  const { sidebarCollapsed, sidebarMobileOpen, toggleSidebar, closeMobileSidebar } = useUIStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const meta = module ? MODULE_META[module] : null

  // No mobile: expanded se aberto; no tablet: sempre collapsed; no desktop: segue sidebarCollapsed
  const isExpanded = sidebarMobileOpen  // mobile override
  const desktopCollapsed = sidebarCollapsed

  return (
    <>
      {/* Backdrop mobile */}
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-full flex flex-col transition-all duration-200 z-30 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden',
          // Mobile: desliza para fora quando fechado, w-64 quando aberto
          isExpanded ? 'translate-x-0 w-64' : '-translate-x-full w-64',
          // Tablet (md): sempre visível, sempre icon-only
          'md:translate-x-0 md:w-16',
          // Desktop (lg): segue preferência
          desktopCollapsed ? 'lg:w-16' : 'lg:w-60',
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center h-14 px-4 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-3',
          // icon-only: centralizado (tablet + desktop collapsed)
          'md:justify-center md:px-0',
          !desktopCollapsed && 'lg:justify-start lg:px-4',
        )}>
          {/* Logo — visível no mobile aberto e desktop expandido */}
          <span className={cn(
            'text-base font-bold text-slate-900 dark:text-white tracking-tight flex-1',
            // esconder no tablet e desktop collapsed
            'md:hidden',
            !desktopCollapsed && 'lg:block',
          )}>
            z<span className="text-sky-500">Saúde</span>
          </span>

          {/* Botão fechar mobile */}
          <button
            onClick={closeMobileSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors md:hidden"
          >
            <X size={16} />
          </button>

          {/* Botão toggle desktop */}
          <button
            onClick={toggleSidebar}
            className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {desktopCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Módulo atual */}
        {meta && (
          <div
            className={cn(
              'mx-3 mt-3 mb-1 rounded-xl p-3 flex items-center gap-2.5',
              // collapsed (tablet + desktop collapsed): centralizado sem margem
              'md:mx-2 md:justify-center',
              !desktopCollapsed && 'lg:mx-3 lg:justify-start',
            )}
            style={{ backgroundColor: meta.color + '12' }}
          >
            <div className="shrink-0" style={{ color: meta.color }}>
              {meta.icon}
            </div>
            <div className={cn('min-w-0', 'md:hidden', !desktopCollapsed && 'lg:block')}>
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: meta.color }}>
                {meta.abbrev}
              </p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{meta.label}</p>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
          {module && meta && (
            <NavItem
              icon={<LayoutDashboard size={16} />}
              label="Início"
              active={location.pathname === `/${module}`}
              color={meta.color}
              onClick={() => { navigate(`/${module}`); closeMobileSidebar() }}
            />
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-2 space-y-0.5 shrink-0">
          {/* User info — visível no mobile aberto e desktop expandido */}
          {user && (
            <div className={cn(
              'flex items-center gap-2.5 px-2 py-2 mb-1',
              'md:hidden',
              !desktopCollapsed && 'lg:flex',
            )}>
              <div className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center text-xs font-bold text-sky-600 dark:text-sky-400 shrink-0">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {user.name.split(' ')[0]} {user.name.split(' ').slice(-1)[0]}
                </p>
                <p className="text-[10px] text-slate-400 truncate">{user.role}</p>
              </div>
            </div>
          )}

          <button
            onClick={() => { navigate('/selecionar-sistema'); closeMobileSidebar() }}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors',
              'md:justify-center',
              !desktopCollapsed && 'lg:justify-start',
            )}
            title="Trocar módulo"
          >
            <LayoutGrid size={15} />
            <span className={cn('md:hidden', !desktopCollapsed && 'lg:inline')}>Trocar módulo</span>
          </button>

          <button
            onClick={() => { logout(); closeMobileSidebar() }}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors',
              'md:justify-center',
              !desktopCollapsed && 'lg:justify-start',
            )}
            title="Sair"
          >
            <LogOut size={15} />
            <span className={cn('md:hidden', !desktopCollapsed && 'lg:inline')}>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}

interface NavItemProps {
  icon: React.ReactNode
  label: string
  active: boolean
  color: string
  onClick: () => void
}

function NavItem({ icon, label, active, color, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors',
        // mobile aberto: row normal; tablet: centralizado; desktop: row normal
        'justify-start md:justify-center lg:justify-start',
        active
          ? 'text-white'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800',
      )}
      style={active ? { backgroundColor: color } : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {/* label visível no mobile aberto e desktop expandido; some no tablet/desktop collapsed */}
      <span className="truncate md:hidden lg:inline">{label}</span>
    </button>
  )
}
