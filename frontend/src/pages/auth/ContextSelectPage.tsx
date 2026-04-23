import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useTheme } from '../../hooks/useTheme'
import { toast } from '../../store/toastStore'
import { HttpError } from '../../api/client'
import {
  Building2, ChevronDown, ChevronRight, Layers, LogOut, MapPin, Moon,
  Shield, Stethoscope, Sun, User,
} from 'lucide-react'
import { cn, formatShortName } from '../../lib/utils'
import { BrandName } from '../../components/shared/BrandName'
import { UserAvatar } from '../../components/shared/UserAvatar'

const FACILITY_TYPE_COLOR: Record<string, string> = {
  SMS:         '#0ea5e9',
  UBS:         '#10b981',
  UPA:         '#f59e0b',
  Hospital:    '#ef4444',
  Lab:         '#8b5cf6',
  VISA:        '#f97316',
  Transportes: '#6b7280',
}

export function ContextSelectPage() {
  const { user, context, contextOptions, fetchContextOptions, selectContext, selectSystem, logout, isAuthenticated } = useAuthStore()
  const { theme, toggle: toggleDarkMode } = useTheme()
  const darkMode = theme === 'dark'
  const navigate = useNavigate()
  const [expandedMun, setExpandedMun] = useState<string | null>(null)
  // Key = `${facilityId}:${bindingId ?? '-'}`. Cada binding é uma linha
  // independente — não existe mais modal pra escolher CBO.
  const [selecting, setSelecting] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return }
    // Caso a hidratação do guard não tenha carregado options por algum motivo
    if (!contextOptions) {
      fetchContextOptions().catch(() => navigate('/login'))
    }
  }, []) // eslint-disable-line

  // Fecha o menu ao clicar fora — mesma UX do SystemSelectPage.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Esconde municípios sem unidade cadastrada — não há onde estabelecer
  // contexto de trabalho. (Para MASTER o backend lista tudo; o admin panel
  // continua mostrando esses municípios para gerenciá-los.)
  const accessible = (contextOptions?.municipalities ?? []).filter(m => m.facilities.length > 0)
  const totalFacilities = accessible.reduce((s, m) => s + m.facilities.length, 0)
  // Conta cada binding como uma linha independente; unidades sem binding
  // contam como 1. É o número real de "opções" que o usuário tem.
  const totalRows = accessible.reduce(
    (s, m) => s + m.facilities.reduce(
      (ss, f) => ss + Math.max(1, f.cnesBindings.length), 0,
    ), 0,
  )

  const handleSelect = async (
    municipalityId: string,
    facilityId: string,
    cboBindingId: string | null = null,
  ) => {
    const key = `${facilityId}:${cboBindingId ?? '-'}`
    setSelecting(key)
    try {
      const modules = await selectContext(municipalityId, facilityId, { cboBindingId })
      const ctx = useAuthStore.getState().context
      if (ctx) {
        toast.success('Contexto selecionado', `${ctx.facility.shortName} · ${ctx.municipality.name}`)
      }
      if (modules.length === 1) {
        selectSystem(modules[0])
        navigate(`/${modules[0]}`, { replace: true })
      } else {
        navigate('/selecionar-sistema')
      }
    } catch (e) {
      toast.error(
        'Falha ao selecionar contexto',
        e instanceof HttpError ? e.message : 'Tente novamente.',
      )
    } finally {
      setSelecting(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top bar — mesmo padrão do SystemSelectPage */}
      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0">
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
                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                  {context?.role ?? user?.email}
                </p>
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

                {/* Dados da conta — só quando há contexto ativo
                    (pode acontecer se o usuário voltou aqui pra trocar
                    de unidade sem ter feito logout). */}
                {context && (
                  <div className="p-3 space-y-1 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Dados da conta</p>

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
                        <p className="text-[10px] text-slate-400">Unidade atual</p>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{context.facility.shortName}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Logout */}
                <div className="p-2 space-y-0.5">
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); navigate('/login') }}
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
      <div className="flex-1 flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-2xl">
          {/* Heading */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950 text-sky-500 mb-4">
              <Layers size={22} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Selecione o Acesso</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              Você tem <strong className="text-slate-700 dark:text-slate-300">{totalRows} opç{totalRows !== 1 ? 'ões' : 'ão'}</strong>{' '}
              em <strong className="text-slate-700 dark:text-slate-300">{totalFacilities} unidade{totalFacilities !== 1 ? 's' : ''}</strong>{' '}
              de <strong className="text-slate-700 dark:text-slate-300">{accessible.length} município{accessible.length !== 1 ? 's' : ''}</strong>
            </p>
          </div>

          {/* Atalho para o painel da plataforma (só MASTER) */}
          {user?.level === 'master' && (
            <button
              onClick={() => navigate('/sys')}
              className="group w-full mb-6 bg-gradient-to-r from-violet-950 to-slate-900 hover:from-violet-900 hover:to-slate-800 border border-violet-800/60 rounded-2xl px-5 py-4 text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-4"
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

          {/* Municipality list */}
          <div className="space-y-3">
            {accessible.map(({ municipality, facilities }) => {
              const isExpanded = expandedMun === municipality.id || accessible.length === 1
              return (
                <div
                  key={municipality.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden"
                >
                  {/* Municipality header */}
                  {accessible.length > 1 && (
                    <button
                      onClick={() => setExpandedMun(isExpanded ? null : municipality.id)}
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <MapPin size={15} className="text-slate-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{municipality.name}</p>
                        <p className="text-[11px] text-slate-400">{municipality.state} · {facilities.length} unidade{facilities.length !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronDown
                        size={15}
                        className={cn('text-slate-400 transition-transform', isExpanded && 'rotate-180')}
                      />
                    </button>
                  )}

                  {/* Municipality label (when only one) */}
                  {accessible.length === 1 && (
                    <div className="flex items-center gap-3 px-5 pt-4 pb-2">
                      <MapPin size={14} className="text-slate-400 shrink-0" />
                      <p className="text-xs text-slate-400">
                        {municipality.name} · {municipality.state}
                      </p>
                    </div>
                  )}

                  {/* Facilities — cada binding é uma linha; unidades sem
                      binding aparecem numa única linha com o role do acesso. */}
                  {isExpanded && (
                    <div className={cn('divide-y divide-slate-100 dark:divide-slate-800', accessible.length > 1 && 'border-t border-slate-100 dark:border-slate-800')}>
                      {facilities.flatMap(({ facility, role, modules, cnesBindings }) => {
                        const color = FACILITY_TYPE_COLOR[facility.type] ?? '#6b7280'
                        // Zero binding → 1 linha só com o role do acesso.
                        // N bindings → N linhas, cada uma mostrando o CBO.
                        const rows = cnesBindings.length === 0
                          ? [{ bindingId: null as string | null, binding: null as null | typeof cnesBindings[number] }]
                          : cnesBindings.map(b => ({ bindingId: b.id, binding: b }))
                        return rows.map(({ bindingId, binding }) => {
                          const key = `${facility.id}:${bindingId ?? '-'}`
                          // Role/módulos efetivos: quando há binding com
                          // role próprio, usa o dele; senão herda do acesso.
                          const effectiveRole = binding?.role || role
                          const effectiveModules = binding?.modules ?? modules
                          return (
                            <button
                              key={key}
                              onClick={() => handleSelect(municipality.id, facility.id, bindingId)}
                              disabled={selecting !== null}
                              className="group w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left disabled:opacity-60"
                            >
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold transition-transform group-hover:scale-105"
                                style={{ backgroundColor: color + '15', color }}
                              >
                                <Building2 size={16} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-slate-900 dark:group-hover:text-white">
                                  {facility.name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                    style={{ backgroundColor: color + '15', color }}
                                  >
                                    {facility.type}
                                  </span>
                                  <span className="text-[11px] text-slate-400">{effectiveRole}</span>
                                </div>
                                {binding && (
                                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                    <Stethoscope size={11} className="text-sky-500 shrink-0" />
                                    <span className="font-medium truncate">
                                      {binding.cnesSnapshotNome || 'Profissional'}
                                    </span>
                                    <span className="font-mono text-[10px] px-1 rounded bg-slate-100 dark:bg-slate-800 shrink-0">
                                      CBO {binding.cboId}
                                    </span>
                                    <span className="truncate">· {binding.cboDescription || '—'}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-slate-400">
                                  {effectiveModules.length} módulo{effectiveModules.length !== 1 ? 's' : ''}
                                </span>
                                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                              </div>
                            </button>
                          )
                        })
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <footer className="text-center py-6 shrink-0">
        <p className="text-xs text-slate-400 dark:text-slate-600">© {new Date().getFullYear()} Secretaria Municipal de Saúde</p>
      </footer>
    </div>
  )
}
