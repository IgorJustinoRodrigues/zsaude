import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, MapPin, Building2, Users, Settings, ScrollText,
  LogOut, Shield, ChevronRight, KeyRound, LayoutGrid, Download, Database,
  Sparkles, User, Cake, Mail, Megaphone,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTheme } from '../../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'
import { initials, cn } from '../../lib/utils'
import { Toaster } from '../ui/Toaster'
import { DialogContainer } from '../ui/DialogContainer'
import { ChangePasswordModal } from '../ui/ChangePasswordModal'
import { BirthdayModal } from '../ui/BirthdayModal'
import { useBirthdayCheck } from '../../hooks/useBirthdayCheck'
import { AccessibilityMenu } from '../ui/AccessibilityMenu'
import { BrandName } from '../shared/BrandName'
import { authApi } from '../../api/auth'

/**
 * Layout da área MASTER. Sidebar violeta escuro pra deixar claro que o usuário
 * está num ambiente de plataforma (acima de qualquer município).
 */
export function SysShell() {
  const { user, logout } = useAuthStore()
  const birthday = useBirthdayCheck()
  const passwordBlocking = user?.passwordExpired || user?.mustChangePassword
  const { theme, toggle: toggleDarkMode } = useTheme()
  const darkMode = theme === 'dark'
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
          <SysNavItem to="/sys/cadsus"         icon={<Database size={15} />}>Integração CadSUS</SysNavItem>
          <SysNavItem to="/sys/ia"              icon={<Sparkles size={15} />}>Gateway de IA</SysNavItem>
          <SysNavItem to="/sys/configuracoes"  icon={<Settings size={15} />}>Configurações</SysNavItem>
          <SysNavItem to="/sys/templates-email" icon={<Mail size={15} />}>Templates de e-mail</SysNavItem>
          <SysNavItem to="/sys/credenciais-email" icon={<KeyRound size={15} />}>Credenciais SES</SysNavItem>
          <SysNavItem to="/sys/notificacoes" icon={<Megaphone size={15} />}>Enviar notificação</SysNavItem>
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
          <button
            type="button"
            onClick={() => navigate('/sys/minha-conta')}
            title="Minha conta"
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-violet-900/40 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {user ? initials(user.name) : 'M'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[10px] text-violet-300 tracking-widest uppercase">Administrador</p>
            </div>
            <User size={14} className="text-violet-400" />
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-violet-300 hover:text-white hover:bg-violet-900/40 transition-colors text-xs"
          >
            <LogOut size={14} />
            Sair
          </button>
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
          <div className="flex items-center gap-2">
            {/* Aniversário — só aparece no dia */}
            {birthday.isBirthday && (
              <button
                type="button"
                onClick={birthday.openModal}
                title="Hoje é seu aniversário! 🎉"
                aria-label="Abrir mensagem de aniversário"
                className="relative p-1.5 rounded-lg text-pink-500 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/40 transition-colors"
              >
                <Cake size={15} />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              </button>
            )}
            <AccessibilityMenu />
            <button
              onClick={toggleDarkMode}
              title={darkMode ? 'Modo claro' : 'Modo escuro'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>

      <Toaster />
      <DialogContainer />

      {/* Aniversário — só abre se não há modal bloqueante de senha. */}
      {!passwordBlocking && birthday.modalOpen && birthday.data && (
        <BirthdayModal data={birthday.data} onClose={birthday.closeModal} />
      )}

      {/* Senha expirada ou provisória: modal bloqueante. */}
      {(user?.passwordExpired || user?.mustChangePassword) && (
        <ChangePasswordModal
          required
          reason={user.mustChangePassword && !user.passwordExpired ? 'provisional' : 'expired'}
          onClose={() => { /* required, não fecha */ }}
          onChanged={async () => {
            try {
              const me = await authApi.me()
              useAuthStore.setState({ user: me })
            } catch { /* ignora */ }
          }}
        />
      )}
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
