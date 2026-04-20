import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { toast } from '../../store/toastStore'
import { HttpError } from '../../api/client'
import {
  MapPin, Building2, ChevronRight, Sun, Moon, LogOut,
  ChevronDown, Layers, Stethoscope, X,
} from 'lucide-react'
import { initials } from '../../lib/utils'
import { cn } from '../../lib/utils'
import { BrandName } from '../../components/shared/BrandName'
import type { ContextCnesBinding } from '../../api/workContext'

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
  // Quando a unidade escolhida tem 2+ vínculos CNES, seguramos o select
  // num modal pra o usuário decidir sob qual CBO vai operar.
  const [cboPick, setCboPick] = useState<null | {
    municipalityId: string
    facilityId: string
    bindings: ContextCnesBinding[]
  }>(null)

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return }
    // Caso a hidratação do guard não tenha carregado options por algum motivo
    if (!contextOptions) {
      fetchContextOptions().catch(() => navigate('/login'))
    }
  }, []) // eslint-disable-line

  // Esconde municípios sem unidade cadastrada — não há onde estabelecer
  // contexto de trabalho. (Para MASTER o backend lista tudo; o admin panel
  // continua mostrando esses municípios para gerenciá-los.)
  const accessible = (contextOptions?.municipalities ?? []).filter(m => m.facilities.length > 0)
  const totalFacilities = accessible.reduce((s, m) => s + m.facilities.length, 0)

  const handleSelect = async (
    municipalityId: string,
    facilityId: string,
    cboBindingId: string | null = null,
  ) => {
    // Procura a unidade escolhida pra decidir se precisa perguntar o CBO.
    const mun = accessible.find(m => m.municipality.id === municipalityId)
    const fac = mun?.facilities.find(f => f.facility.id === facilityId)
    const bindings = fac?.cnesBindings ?? []
    if (!cboBindingId && bindings.length > 1) {
      // Abre modal — o user decide qual CBO usar e chamamos de novo com o id.
      setCboPick({ municipalityId, facilityId, bindings })
      return
    }

    setSelecting(facilityId)
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
      {/* Top bar */}
      <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0">
        <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          <BrandName accentClassName="text-sky-500" />
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

      {/* Modal de seleção de CBO (só aparece quando a unidade tem 2+ bindings) */}
      {cboPick && (
        <div
          className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setCboPick(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Stethoscope size={11} className="text-sky-500" />
                  Vínculo CNES
                </p>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  Operando como qual profissional?
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Este acesso tem {cboPick.bindings.length} vínculos CNES. Escolha sob qual CBO você vai atuar nesta sessão.
                </p>
              </div>
              <button onClick={() => setCboPick(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={14} />
              </button>
            </div>

            <div className="p-3 space-y-1 max-h-[60vh] overflow-y-auto">
              {cboPick.bindings.map(b => (
                <button
                  key={b.id}
                  type="button"
                  disabled={selecting !== null}
                  onClick={() => {
                    const pick = cboPick
                    setCboPick(null)
                    void handleSelect(pick.municipalityId, pick.facilityId, b.id)
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-sky-400 hover:bg-sky-50/40 dark:hover:bg-sky-950/30 transition-colors disabled:opacity-60"
                >
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {b.cnesSnapshotNome || 'Profissional'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 mr-1.5">
                      CBO {b.cboId}
                    </span>
                    {b.cboDescription || '—'}
                  </p>
                  {b.cnesSnapshotCpf && (
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      CPF {b.cnesSnapshotCpf.slice(0,3)}.{b.cnesSnapshotCpf.slice(3,6)}.{b.cnesSnapshotCpf.slice(6,9)}-{b.cnesSnapshotCpf.slice(9,11)}
                    </p>
                  )}
                </button>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setCboPick(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const pick = cboPick
                  setCboPick(null)
                  void handleSelect(pick.municipalityId, pick.facilityId, null)
                }}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Entrar sem escolher agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
