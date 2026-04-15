import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { SYSTEMS } from '../../mock/users'
import {
  Stethoscope, FlaskConical, BedDouble, ShieldCheck,
  ClipboardCheck, Truck, LogOut, ChevronRight, Sun, Moon,
  HelpCircle, ChevronDown, User, Building2, Shield, LayoutGrid,
} from 'lucide-react'
import { initials } from '../../lib/utils'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'

const ICONS: Record<SystemId, React.ReactNode> = {
  cln: <Stethoscope size={22} />,
  dgn: <FlaskConical size={22} />,
  hsp: <BedDouble size={22} />,
  pln: <ShieldCheck size={22} />,
  fsc: <ClipboardCheck size={22} />,
  ops: <Truck size={22} />,
}

const ICON_SM: Record<SystemId, React.ReactNode> = {
  cln: <Stethoscope size={12} />,
  dgn: <FlaskConical size={12} />,
  hsp: <BedDouble size={12} />,
  pln: <ShieldCheck size={12} />,
  fsc: <ClipboardCheck size={12} />,
  ops: <Truck size={12} />,
}

export function SystemSelectPage() {
  const { user, context, selectSystem, logout } = useAuthStore()
  const { darkMode, toggleDarkMode } = useUIStore()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleSelect = (id: SystemId) => {
    selectSystem(id)
    navigate(`/${id}`)
  }

  const available = context?.modules?.length
    ? SYSTEMS.filter(s => context.modules.includes(s.id))
    : SYSTEMS

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6">
        <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          z<span className="text-sky-500">Saúde</span>
        </span>

        <div className="flex items-center gap-2">
          {/* Dark mode */}
          <button
            onClick={toggleDarkMode}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* User menu */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className={cn(
                'flex items-center gap-2.5 h-9 pl-2 pr-3 rounded-xl border transition-all',
                userMenuOpen
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
              )}
            >
              <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white">
                {user ? initials(user.name) : 'U'}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">
                  {user?.name?.split(' ')[0]} {user?.name?.split(' ').slice(-1)[0]}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{context?.role ?? user?.email}</p>
              </div>
              <ChevronDown
                size={13}
                className={cn('text-slate-400 transition-transform', userMenuOpen && 'rotate-180')}
              />
            </button>

            {/* Dropdown */}
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden">

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
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{context?.role ?? '—'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                    <Building2 size={13} className="text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400">Unidade</p>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{context?.facility.shortName ?? '—'}</p>
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
                        onClick={() => { handleSelect(sys.id); setUserMenuOpen(false) }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: sys.color + '12',
                          borderColor: sys.color + '30',
                          color: sys.color,
                        }}
                      >
                        {ICON_SM[sys.id]}
                        {sys.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trocar unidade + Logout */}
                <div className="p-2 space-y-0.5">
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/selecionar-contexto') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <LayoutGrid size={14} />
                    Trocar unidade
                  </button>
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
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Selecione o módulo</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Escolha onde deseja trabalhar hoje</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl">
          {available.map(sys => (
            <div key={sys.id} className="relative">
              <button
                onClick={() => handleSelect(sys.id)}
                className="group w-full bg-white dark:bg-slate-900 hover:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-900 dark:hover:border-slate-600 rounded-2xl p-5 text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                    style={{ backgroundColor: sys.color + '18', color: sys.color }}
                  >
                    {ICONS[sys.id]}
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all mt-0.5"
                  />
                </div>
                <p className="text-[10px] font-bold tracking-widest text-slate-400 group-hover:text-slate-500 uppercase mb-1">
                  {sys.abbrev}
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-white transition-colors leading-snug">
                  {sys.name}
                </p>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
                  {sys.description}
                </p>
              </button>

              {/* Help tooltip */}
              <div className="absolute top-3 right-3 group/tip z-10">
                <button
                  onClick={e => e.stopPropagation()}
                  className="flex items-center justify-center w-5 h-5 rounded-full text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 transition-colors"
                >
                  <HelpCircle size={14} />
                </button>
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-slate-900 dark:bg-slate-800 text-white rounded-xl px-3 py-2.5 shadow-xl opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-150 z-20">
                  <p className="text-[10px] text-slate-400 mb-0.5">Nome original</p>
                  <p className="text-xs font-medium leading-snug">{sys.originalName}</p>
                  <div className="absolute -top-1.5 right-2 w-3 h-3 bg-slate-900 dark:bg-slate-800 rotate-45" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center py-6">
        <p className="text-xs text-slate-400 dark:text-slate-600">© {new Date().getFullYear()} Secretaria Municipal de Saúde</p>
      </footer>
    </div>
  )
}
