import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Stethoscope, FlaskConical, BedDouble, ShieldCheck,
  ClipboardCheck, Truck, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, X,
  LayoutDashboard, MapPin, Users, List, UserPlus, ChevronDown, ScrollText,
  BarChart2, SearchCheck, Upload, TrendingUp, BellRing, Link2,
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { initials } from '../../lib/utils'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'
import { BrandName } from '../shared/BrandName'

const MODULE_META: Record<SystemId, { label: string; abbrev: string; icon: React.ReactNode; color: string }> = {
  cln: { label: 'Clínica',     abbrev: 'CLN', icon: <Stethoscope size={18} />,    color: '#0ea5e9' },
  dgn: { label: 'Diagnóstico', abbrev: 'DGN', icon: <FlaskConical size={18} />,   color: '#8b5cf6' },
  hsp: { label: 'Hospitalar',  abbrev: 'HSP', icon: <BedDouble size={18} />,      color: '#f59e0b' },
  pln: { label: 'Planos',      abbrev: 'PLN', icon: <ShieldCheck size={18} />,    color: '#10b981' },
  fsc: { label: 'Fiscal',      abbrev: 'FSC', icon: <ClipboardCheck size={18} />, color: '#f97316' },
  ops: { label: 'Operações',   abbrev: 'OPS', icon: <Truck size={18} />,          color: '#6b7280' },
  ind: { label: 'Indicadores', abbrev: 'IND', icon: <TrendingUp size={18} />,     color: '#ec4899' },
  cha: { label: 'Chamadas',    abbrev: 'CHA', icon: <BellRing size={18} />,       color: '#14b8a6' },
  esu: { label: 'Integra Esus',abbrev: 'ESU', icon: <Link2 size={18} />,          color: '#6366f1' },
}

type SubItem   = { label: string; path: string; icon: React.ReactNode }
type NavGroup  = { kind: 'group';   icon: React.ReactNode; label: string; collapsedPath: string; children: SubItem[] }
type NavItem   = { kind: 'item';    icon: React.ReactNode; label: string; path: string }
type NavSection = { kind: 'section'; label: string }
type NavEntry  = NavItem | NavGroup | NavSection

const MODULE_NAV: Partial<Record<SystemId, NavEntry[]>> = {
  hsp: [
    { kind: 'section', label: 'Cadastros' },
    {
      kind: 'group',
      icon: <Users size={16} />,
      label: 'Pacientes',
      collapsedPath: '/hsp/pacientes',
      children: [
        { label: 'Listar',    path: '/hsp/pacientes',      icon: <List size={13} /> },
        { label: 'Cadastrar', path: '/hsp/pacientes/novo', icon: <UserPlus size={13} /> },
      ],
    },
  ],
  ops: [
    { kind: 'section', label: 'Cadastros' },
    {
      kind: 'group',
      icon: <Users size={16} />,
      label: 'Usuários',
      collapsedPath: '/ops/usuarios',
      children: [
        { label: 'Listar',    path: '/ops/usuarios',      icon: <List size={13} /> },
        { label: 'Cadastrar', path: '/ops/usuarios/novo', icon: <UserPlus size={13} /> },
      ],
    },
    { kind: 'section', label: 'Importações' },
    { kind: 'item', icon: <Upload size={16} />, label: 'Importações', path: '/ops/importacoes' },
    { kind: 'section', label: 'Auditoria' },
    { kind: 'item', icon: <ScrollText size={16} />, label: 'Logs do sistema', path: '/ops/logs' },
    { kind: 'section', label: 'Relatórios' },
    { kind: 'item', icon: <BarChart2 size={16} />, label: 'Relatórios', path: '/ops/relatorios' },
    { kind: 'section', label: 'Pesquisas' },
    { kind: 'item', icon: <SearchCheck size={16} />, label: 'Pesquisas', path: '/ops/pesquisas' },
  ],
}

interface Props { module: SystemId | null }

export function Sidebar({ module }: Props) {
  const { sidebarCollapsed, sidebarMobileOpen, toggleSidebar, closeMobileSidebar } = useUIStore()
  const { user, context, contextOptions, logout } = useAuthStore()
  const canSwitchModule = (context?.modules?.length ?? 0) > 1
  const totalFacilities =
    contextOptions?.municipalities.reduce((s, m) => s + m.facilities.length, 0) ?? 0
  const canSwitchUnit = totalFacilities > 1
  const navigate = useNavigate()
  const location = useLocation()
  const meta = module ? MODULE_META[module] : null

  // Grupos expandidos: inicializa aberto se algum filho estiver ativo
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    if (module) {
      MODULE_NAV[module]?.forEach(entry => {
        if (entry.kind === 'group') {
          const anyActive = entry.children.some(c => location.pathname === c.path)
          if (anyActive) init[entry.label] = true
        }
      })
    }
    return init
  })

  const closeAllGroups = () => setOpenGroups({})

  // Accordion: ao abrir um grupo fecha os outros
  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ [label]: !prev[label] }))

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
            <BrandName accentClassName="text-sky-500" />
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
            <>
              <NavItem
                icon={<LayoutDashboard size={16} />}
                label="Início"
                active={location.pathname === `/${module}`}
                color={meta.color}
                collapsed={desktopCollapsed}
                onClick={() => { navigate(`/${module}`); closeMobileSidebar(); closeAllGroups() }}
              />

              {MODULE_NAV[module]?.map((entry, i) => {
                if (entry.kind === 'section') {
                  return (
                    <div key={`sec-${i}`}>
                      {/* Divisor visível no collapsed */}
                      <div className={cn('mx-2 my-2 border-t border-slate-100 dark:border-slate-800', !desktopCollapsed && 'lg:hidden')} />
                      {/* Label visível no expandido */}
                      <p className={cn(
                        'pt-3 pb-1 px-2.5 text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-slate-600',
                        'md:hidden',
                        !desktopCollapsed && 'lg:block',
                      )}>
                        {entry.label}
                      </p>
                    </div>
                  )
                }

                if (entry.kind === 'group') {
                  const anyChildActive = entry.children.some(c => location.pathname === c.path)
                  const isOpen = openGroups[entry.label] ?? false
                  return (
                    <div key={entry.label}>
                      {/* Quando collapsed: botão vai direto para collapsedPath */}
                      <button
                        onClick={() => {
                          // tablet (md < lg): sidebar sempre icon-only, navega direto
                          const isTablet = !sidebarMobileOpen && window.innerWidth < 1024
                          if (desktopCollapsed || isTablet) { navigate(entry.collapsedPath); closeMobileSidebar() }
                          else toggleGroup(entry.label)
                        }}
                        title={entry.label}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors',
                          desktopCollapsed ? 'md:justify-center' : 'justify-start md:justify-center lg:justify-start',
                          anyChildActive && desktopCollapsed
                            ? 'text-white'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800',
                        )}
                        style={anyChildActive && desktopCollapsed ? { backgroundColor: meta.color } : undefined}
                      >
                        <span className="shrink-0">{entry.icon}</span>
                        {!desktopCollapsed && <>
                          <span className="truncate md:hidden lg:inline">{entry.label}</span>
                          <ChevronDown
                            size={13}
                            className={cn(
                              'shrink-0 transition-transform text-slate-400 ml-auto md:hidden lg:block',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </>}
                      </button>

                      {/* Sub-itens — visíveis apenas no expandido e quando aberto */}
                      {isOpen && (
                        <div className={cn('ml-3 pl-3 border-l border-slate-100 dark:border-slate-800 mt-0.5 space-y-0.5', 'md:hidden lg:block')}>
                          {entry.children.map(child => (
                            <button
                              key={child.path}
                              onClick={() => { navigate(child.path); closeMobileSidebar() }}
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors',
                                location.pathname === child.path
                                  ? 'font-semibold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800',
                              )}
                            >
                              <span className="shrink-0">{child.icon}</span>
                              {child.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <NavItem
                    key={entry.path}
                    icon={entry.icon}
                    label={entry.label}
                    active={location.pathname === entry.path}
                    color={meta.color}
                    collapsed={desktopCollapsed}
                    onClick={() => { navigate(entry.path); closeMobileSidebar(); closeAllGroups() }}
                  />
                )
              })}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-2 space-y-0.5 shrink-0">
          {/* User info — visível no mobile aberto e desktop expandido */}
          {user && (
            <div className={cn(
              'flex items-center gap-2.5 px-2 py-2',
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
                <p className="text-[10px] text-slate-400 truncate">{context?.role ?? user.email}</p>
              </div>
            </div>
          )}

          {/* Contexto ativo (município + unidade) */}
          {context && (
            <div className={cn(
              'flex items-start gap-2 px-2 py-1.5 mb-0.5 rounded-lg',
              'md:hidden',
              !desktopCollapsed && 'lg:flex',
            )}>
              <MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                  {context.facility.shortName}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {context.municipality.name} · {context.municipality.state}
                </p>
              </div>
            </div>
          )}

          {canSwitchModule && (
            <button
              onClick={() => { navigate('/selecionar-sistema'); closeMobileSidebar() }}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors',
                desktopCollapsed ? 'md:justify-center' : 'justify-start md:justify-center lg:justify-start',
              )}
              title="Trocar módulo"
            >
              <LayoutGrid size={15} />
              {!desktopCollapsed && <span className="md:hidden lg:inline">Trocar módulo</span>}
            </button>
          )}

          {canSwitchUnit && (
            <button
              onClick={() => { navigate('/selecionar-contexto'); closeMobileSidebar() }}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors',
                desktopCollapsed ? 'md:justify-center' : 'justify-start md:justify-center lg:justify-start',
              )}
              title="Trocar unidade"
            >
              <MapPin size={15} />
              {!desktopCollapsed && <span className="md:hidden lg:inline">Trocar unidade</span>}
            </button>
          )}

          <button
            onClick={() => { logout(); closeMobileSidebar() }}
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors',
              desktopCollapsed ? 'md:justify-center' : 'justify-start md:justify-center lg:justify-start',
            )}
            title="Sair"
          >
            <LogOut size={15} />
            {!desktopCollapsed && <span className="md:hidden lg:inline">Sair</span>}
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
  collapsed: boolean
  onClick: () => void
}

function NavItem({ icon, label, active, color, collapsed, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors',
        // tablet (md) sempre centralizado; desktop segue collapsed
        collapsed ? 'md:justify-center' : 'justify-start md:justify-center lg:justify-start',
        active
          ? 'text-white'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800',
      )}
      style={active ? { backgroundColor: color } : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {/* label: nunca no tablet (md:hidden); no desktop, só se não collapsed */}
      {!collapsed && <span className="truncate md:hidden lg:inline">{label}</span>}
    </button>
  )
}
