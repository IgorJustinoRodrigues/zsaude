import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import {
  MapPin, Building2, ChevronRight, Sun, Moon, LogOut,
  ChevronDown, Layers,
} from 'lucide-react'
import { initials } from '../../lib/utils'
import { cn } from '../../lib/utils'

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
  const { user, contextOptions, fetchContextOptions, selectContext, selectSystem, logout, isAuthenticated } = useAuthStore()
  const { darkMode, toggleDarkMode } = useUIStore()
  const navigate = useNavigate()
  const [expandedMun, setExpandedMun] = useState<string | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return }
    // Carrega options do backend caso ainda não estejam em memória
    if (!contextOptions) {
      fetchContextOptions().catch(() => navigate('/login'))
    }
  }, []) // eslint-disable-line

  if (!user) return null

  const accessible = contextOptions?.municipalities ?? []
  const totalFacilities = accessible.reduce((s, m) => s + m.facilities.length, 0)

  const handleSelect = async (municipalityId: string, facilityId: string) => {
    setSelecting(facilityId)
    try {
      const modules = await selectContext(municipalityId, facilityId)
      if (modules.length === 1) {
        selectSystem(modules[0])
        navigate(`/${modules[0]}`, { replace: true })
      } else {
        navigate('/selecionar-sistema')
      }
    } finally {
      setSelecting(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0">
        <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          z<span className="text-sky-500">Saúde</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDarkMode}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="flex items-center gap-2.5 h-9 pl-2 pr-3 rounded-xl">
            <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white">
              {user ? initials(user.name) : 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">
                {user?.name?.split(' ')[0]}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sair</span>
          </button>
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Selecione a unidade</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              Você tem acesso a <strong className="text-slate-700 dark:text-slate-300">{totalFacilities} unidade{totalFacilities !== 1 ? 's' : ''}</strong>{' '}
              em <strong className="text-slate-700 dark:text-slate-300">{accessible.length} município{accessible.length !== 1 ? 's' : ''}</strong>
            </p>
          </div>

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

                  {/* Facilities */}
                  {isExpanded && (
                    <div className={cn('divide-y divide-slate-100 dark:divide-slate-800', accessible.length > 1 && 'border-t border-slate-100 dark:border-slate-800')}>
                      {facilities.map(({ facility, role, modules }) => {
                        const color = FACILITY_TYPE_COLOR[facility.type] ?? '#6b7280'
                        return (
                          <button
                            key={facility.id}
                            onClick={() => handleSelect(municipality.id, facility.id)}
                            disabled={selecting !== null}
                            className="group w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left disabled:opacity-60"
                          >
                            {/* Type indicator */}
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold transition-transform group-hover:scale-105"
                              style={{ backgroundColor: color + '15', color }}
                            >
                              <Building2 size={16} />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-slate-900 dark:group-hover:text-white">
                                {facility.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                  style={{ backgroundColor: color + '15', color }}
                                >
                                  {facility.type}
                                </span>
                                <span className="text-[11px] text-slate-400">{role}</span>
                              </div>
                            </div>

                            {/* Modules count */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-slate-400">
                                {modules.length} módulo{modules.length !== 1 ? 's' : ''}
                              </span>
                              <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </button>
                        )
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
