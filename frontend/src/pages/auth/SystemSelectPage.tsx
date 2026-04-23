import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useTheme } from '../../hooks/useTheme'
import { SYSTEMS } from '../../mock/users'
import {
  Stethoscope, FlaskConical, BedDouble, ShieldCheck,
  ClipboardCheck, Truck, LogOut, ChevronRight, Sun, Moon,
  HelpCircle, ChevronDown, User, Building2, Shield, LayoutGrid,
  TrendingUp, BellRing, Link2, ArrowLeft, AlertCircle,
} from 'lucide-react'
import { cn, formatShortName } from '../../lib/utils'
import type { SystemId } from '../../types'
import { BrandName } from '../../components/shared/BrandName'
import { UserAvatar } from '../../components/shared/UserAvatar'

const ICONS: Record<SystemId, React.ReactNode> = {
  cln: <Stethoscope size={22} />,
  dgn: <FlaskConical size={22} />,
  hsp: <BedDouble size={22} />,
  pln: <ShieldCheck size={22} />,
  fsc: <ClipboardCheck size={22} />,
  ops: <Truck size={22} />,
  ind: <TrendingUp size={22} />,
  rec: <BellRing size={22} />,
  esu: <Link2 size={22} />,
}

const ICON_SM: Record<SystemId, React.ReactNode> = {
  cln: <Stethoscope size={12} />,
  dgn: <FlaskConical size={12} />,
  hsp: <BedDouble size={12} />,
  pln: <ShieldCheck size={12} />,
  fsc: <ClipboardCheck size={12} />,
  ops: <Truck size={12} />,
  ind: <TrendingUp size={12} />,
  rec: <BellRing size={12} />,
  esu: <Link2 size={12} />,
}

export function SystemSelectPage() {
  const { user, context, selectSystem, logout } = useAuthStore()
  const { theme, toggle: toggleDarkMode } = useTheme()
  const darkMode = theme === 'dark'
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleSelect = (id: SystemId) => {
    selectSystem(id)
    navigate(`/${id}`)
  }

  // Se há contexto, filtra pelos módulos que ele autoriza — mesmo que a
  // lista esteja vazia (= usuário sem acesso a nada daquela unidade).
  // Sem contexto, cai pra todos (tela de fallback pra MASTER ou boot).
  const available = context
    ? SYSTEMS.filter(s => context.modules.includes(s.id))
    : SYSTEMS

  // Auto-select só se o user tem exatamente 1 módulo e NÃO é MASTER.
  // MASTER sempre vê a tela para poder escolher entre módulos ou
  // o painel da plataforma.
  useEffect(() => {
    if (user?.level !== 'master' && available.length === 1) {
      selectSystem(available[0].id)
      navigate(`/${available[0].id}`, { replace: true })
    }
  }, [available.length, user?.level]) // eslint-disable-line

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
          <BrandName accentClassName="text-sky-500" />
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
              {user
                ? <UserAvatar
                    userId={user.id}
                    userName={user.socialName || user.name}
                    photoId={user.currentPhotoId}
                    className="w-7 h-7"
                    initialsClassName="text-xs"
                  />
                : <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white">U</div>}
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">
                  {formatShortName(user)}
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
                    {user
                      ? <UserAvatar
                          userId={user.id}
                          userName={user.socialName || user.name}
                          photoId={user.currentPhotoId}
                          className="w-11 h-11"
                          initialsClassName="text-sm"
                        />
                      : <div className="w-11 h-11 rounded-full bg-sky-500 flex items-center justify-center text-sm font-bold text-white shrink-0">U</div>}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {user?.socialName || user?.name}
                      </p>
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
        {/* Contexto atual + botão voltar */}
        {context && (
          <div className="w-full max-w-2xl mb-6 flex items-center justify-between gap-3">
            <button
              onClick={() => navigate('/selecionar-contexto')}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft size={14} />
              Trocar município / unidade
            </button>
            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
              <p className="font-medium text-slate-700 dark:text-slate-300">
                {context.municipality.name} · {context.municipality.state}
              </p>
              <p className="text-[11px] text-slate-400">{context.facility.shortName}</p>
            </div>
          </div>
        )}

        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Selecione o módulo</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Escolha onde deseja trabalhar hoje</p>
        </div>

        {/* Atalho para o painel da plataforma (só MASTER) */}
        {user?.level === 'master' && (
          <button
            onClick={() => navigate('/sys')}
            className="group w-full max-w-2xl mb-6 bg-gradient-to-r from-violet-950 to-slate-900 hover:from-violet-900 hover:to-slate-800 border border-violet-800/60 rounded-2xl px-5 py-4 text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-500/20 text-violet-200 shrink-0 group-hover:scale-110 transition-transform">
              <Shield size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-violet-300 uppercase mb-0.5">
                Plataforma
              </p>
              <p className="text-sm font-semibold text-white">
                Painel MASTER
              </p>
              <p className="text-xs text-violet-300/80 mt-0.5">
                Municípios, unidades, usuários administrativos, perfis e configurações globais
              </p>
            </div>
            <ChevronRight size={16} className="text-violet-300 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        )}

        {available.length === 0 && user?.level !== 'master' && (
          <div className="w-full max-w-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mb-3">
              <AlertCircle size={22} className="text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">
              Nenhum módulo disponível nesta unidade
            </h2>
            <p className="text-sm text-amber-800/80 dark:text-amber-300/80 mt-1.5">
              Seu perfil nesta unidade não tem acesso a nenhum módulo operacional.
              Tente outra unidade ou peça ao administrador para liberar um perfil com acesso.
            </p>
            <button
              onClick={() => navigate('/selecionar-contexto')}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              <ArrowLeft size={14} />
              Escolher outra unidade
            </button>
          </div>
        )}

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
