import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, MapPin, Building2, Users, Settings, ScrollText,
  LogOut, Shield, ChevronRight, KeyRound, LayoutGrid, Download, Database,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { initials, cn } from '../../lib/utils'
import { Toaster } from '../ui/Toaster'
import { DialogContainer } from '../ui/DialogContainer'
import { BrandName } from '../shared/BrandName'

/**
 * Layout da área MASTER. Sidebar violeta escuro pra deixar claro que o usuário
 * está num ambiente de plataforma (acima de qualquer município).
 */
export function SysShell() {
  const { user, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useUIStore()  // eslint-disable-line
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-gradient-to-b from-violet-950 to-slate-950 border-r border-violet-900/50 text-violet-100 shrink-0">
        {/* Brand */}
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-violet-900/40">
          <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight">
              <BrandName accentClassName="text-violet-300" />
            </p>
            <p className="text-[10px] font-bold tracking-widest text-violet-400 uppercase">Plataforma</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <SysNavSection label="Visão geral" />
          <SysNavItem to="/sys" end icon={<LayoutDashboard size={15} />}>Painel</SysNavItem>

          <SysNavSection label="Cadastros" />
          <SysNavItem to="/sys/municipios" icon={<MapPin size={15} />}>Municípios</SysNavItem>
          <SysNavItem to="/sys/unidades"    icon={<Building2 size={15} />}>Unidades</SysNavItem>
          <SysNavItem to="/sys/usuarios"    icon={<Users size={15} />}>Administradores</SysNavItem>
          <SysNavItem to="/sys/perfis"       icon={<KeyRound size={15} />}>Perfis & permissões</SysNavItem>

          <SysNavSection label="Plataforma" />
          <SysNavItem to="/sys/importacoes"     icon={<Download size={15} />}>Importações</SysNavItem>
          <SysNavItem to="/sys/dados-referencia" icon={<Database size={15} />}>Dados de referência</SysNavItem>
          <SysNavItem to="/sys/configuracoes" icon={<Settings size={15} />}>Configurações</SysNavItem>
          <SysNavItem to="/sys/logs"           icon={<ScrollText size={15} />}>Logs do sistema</SysNavItem>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-violet-900/40 space-y-1">
          {/* Ir para os módulos operacionais */}
          <button
            onClick={() => navigate('/selecionar-sistema')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-violet-200 hover:bg-violet-900/40 hover:text-white transition-colors"
          >
            <LayoutGrid size={15} />
            Módulos operacionais
          </button>

          {/* Usuário */}
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {user ? initials(user.name) : 'M'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-violet-300 tracking-widest uppercase">Administrador</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="p-1.5 rounded-lg text-violet-400 hover:text-white hover:bg-violet-900/40 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* TopBar mínimo (mobile + breadcrumb) */}
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Shield size={13} className="text-violet-500" />
            <span className="font-semibold text-slate-700 dark:text-slate-200">Plataforma</span>
            <ChevronRight size={11} className="text-slate-300" />
            <span>Área MASTER</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? '☀︎' : '☾'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>

      <Toaster />
      <DialogContainer />
    </div>
  )
}

function SysNavSection({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold tracking-widest uppercase text-violet-500 px-3 py-3 first:pt-0">
      {label}
    </p>
  )
}

function SysNavItem({
  to, end, icon, children,
}: { to: string; end?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-violet-500/20 text-white'
            : 'text-violet-200 hover:bg-violet-900/40 hover:text-white',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  )
}
