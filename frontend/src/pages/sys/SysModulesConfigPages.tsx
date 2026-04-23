// Shell genérico para personalização de módulos (MASTER).
//
// Hierarquia de navegação:
//   /sys/municipios/:id/modulos                 → tela 1: módulos
//   /sys/municipios/:id/modulos/:module         → tela 2: seções
//   /sys/municipios/:id/modulos/:module/:sect   → tela 3: form da seção
//
// Mesma estrutura para /sys/unidades/:id/...
//
// A tela 3 é dedicada a cada módulo/seção (ex.: SysRecConfigPage.tsx).

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BellRing, Building2, ChevronRight, Loader2, MapPin,
  MonitorSmartphone, Settings, Stethoscope, Users, type LucideIcon,
} from 'lucide-react'
import { recConfigApi } from '../../api/recConfig'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { directoryApi, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

type Scope = 'municipality' | 'facility'

interface ModuleEntry {
  id: string              // código do módulo (rec, dgn, …)
  label: string
  description: string
  icon: LucideIcon
  /** Cor de acento do cartão (CSS class). */
  accent: string
}

/** Módulos com configuração implementada. Cresce conforme formos adicionando. */
const MODULES_WITH_CONFIG: ModuleEntry[] = [
  {
    id: 'rec',
    label: 'Recepção',
    description: 'Totem, painel de chamadas e balcão',
    icon: BellRing,
    accent: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  },
  {
    id: 'cln',
    label: 'Clínica',
    description: 'Filas de triagem e atendimento pós-recepção',
    icon: Stethoscope,
    accent: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  },
]

interface SectionMeta {
  id: string
  label: string
  description: string
  icon: LucideIcon
}

/** Seções personalizáveis por módulo. */
const SECTIONS_BY_MODULE: Record<string, SectionMeta[]> = {
  rec: [
    {
      id: 'totem',
      label: 'Totem',
      description: 'Formas de identificação e prompt de prioridade',
      icon: MonitorSmartphone,
    },
    {
      id: 'painel',
      label: 'Painel de chamadas',
      description: 'Modo (senha/nome) e anúncio por áudio',
      icon: BellRing,
    },
    {
      id: 'recepcao',
      label: 'Atendimento (balcão)',
      description: 'Encaminhamento pós-atendimento',
      icon: Users,
    },
  ],
  cln: [
    {
      id: 'geral',
      label: 'Configuração do módulo',
      description: 'Ativação, triagem e setores associados',
      icon: Stethoscope,
    },
  ],
}

// ─── Tela 1: módulos ──────────────────────────────────────────────────────────

export function SysMunicipalityModulesPage() {
  return <ModulesPage scope="municipality" />
}

export function SysFacilityModulesPage() {
  return <ModulesPage scope="facility" />
}

function ModulesPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { title, subtitle, loading } = useScopeHeader(scope, id)

  const backHref = scope === 'municipality' ? '/sys/municipios' : '/sys/unidades'
  const basePath =
    scope === 'municipality' ? `/sys/municipios/${id}/modulos` : `/sys/unidades/${id}/modulos`

  const breadcrumbHint =
    scope === 'municipality'
      ? 'Esta é a configuração base das unidades. Cada unidade pode restringir, nunca liberar além daqui.'
      : 'Esta unidade herda o município por padrão. Ao personalizar só é possível restringir.'

  return (
    <div className="space-y-6">
      <ScopeHeader
        scope={scope}
        loading={loading}
        title={title}
        subtitle={subtitle}
        breadcrumb={<span className="flex items-center gap-1 text-teal-600 font-medium"><Settings size={11} /> Personalizar módulos</span>}
        onBack={() => navigate(backHref)}
      />

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        {breadcrumbHint}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {MODULES_WITH_CONFIG.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              onClick={() => navigate(`${basePath}/${m.id}`)}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-left hover:border-teal-400/60 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-start gap-4"
            >
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', m.accent)}>
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{m.label}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{m.description}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all mt-1.5 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tela 2: seções de um módulo ──────────────────────────────────────────────

export function SysMunicipalityModuleSectionsPage() {
  return <ModuleSectionsPage scope="municipality" />
}

export function SysFacilityModuleSectionsPage() {
  return <ModuleSectionsPage scope="facility" />
}

function ModuleSectionsPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id, module } = useParams<{ id: string; module: string }>()
  const { title, subtitle, loading: loadingHeader } = useScopeHeader(scope, id)

  // Raw config — pra saber quais seções já estão personalizadas.
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null)
  const [loadingRaw, setLoadingRaw] = useState(true)

  useEffect(() => {
    if (!id || module !== 'rec') { setLoadingRaw(false); return }
    let cancelled = false
    async function load() {
      try {
        const res = scope === 'municipality'
          ? await recConfigApi.getMunicipality(id!)
          : await recConfigApi.getFacility(id!)
        if (!cancelled) setRaw((res.config ?? null) as Record<string, unknown> | null)
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof HttpError ? e.message : 'Falha ao carregar.'
          toast.error('Erro', msg)
        }
      } finally {
        if (!cancelled) setLoadingRaw(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id, module, scope])

  const mod = MODULES_WITH_CONFIG.find(m => m.id === module)
  const sections = module ? SECTIONS_BY_MODULE[module] ?? [] : []

  const modulesHref =
    scope === 'municipality' ? `/sys/municipios/${id}/modulos` : `/sys/unidades/${id}/modulos`
  const basePath =
    scope === 'municipality'
      ? `/sys/municipios/${id}/modulos/${module}`
      : `/sys/unidades/${id}/modulos/${module}`

  if (!mod) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => navigate(modulesHref)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <p className="text-sm text-red-500">Módulo desconhecido: {module}</p>
      </div>
    )
  }

  const ModIcon = mod.icon

  return (
    <div className="space-y-6">
      <ScopeHeader
        scope={scope}
        loading={loadingHeader}
        title={title}
        subtitle={subtitle}
        breadcrumb={
          <span className="flex items-center gap-1 text-teal-600 font-medium">
            <ModIcon size={11} /> {mod.label}
          </span>
        }
        onBack={() => navigate(modulesHref)}
      />

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        {mod.description}. Clique em uma seção para editar.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sections.map(s => {
          const Icon = s.icon
          const personalized = !loadingRaw && raw !== null && raw[s.id] != null
          return (
            <button
              key={s.id}
              onClick={() => navigate(`${basePath}/${s.id}`)}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-left hover:border-teal-400/60 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-start gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{s.label}</h3>
                  {personalized && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                      Personalizado
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.description}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all mt-1.5 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Header comum ────────────────────────────────────────────────────────────

interface HeaderProps {
  scope: Scope
  loading: boolean
  title: string
  subtitle: string
  breadcrumb: React.ReactNode
  onBack: () => void
}

export function ScopeHeader({ scope, loading, title, subtitle, breadcrumb, onBack }: HeaderProps) {
  const ScopeIcon = scope === 'municipality' ? MapPin : Building2
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={onBack}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 mt-0.5"
      >
        <ArrowLeft size={18} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
          <ScopeIcon size={12} />
          {scope === 'municipality' ? 'Município' : 'Unidade'}
          <span className="text-slate-300">·</span>
          {breadcrumb}
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
          {loading ? 'Carregando...' : title}
        </h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─── Hook compartilhado ──────────────────────────────────────────────────────

export function useScopeHeader(scope: Scope, id: string | undefined) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) { setLoading(false); return }
    let cancelled = false
    async function load() {
      try {
        if (scope === 'municipality') {
          const mun: MunicipalityAdminDetail = await sysApi.getMunicipality(id!)
          if (cancelled) return
          setTitle(mun.name)
          setSubtitle(`${mun.state} · IBGE ${mun.ibge}`)
        } else {
          const all = await directoryApi.listFacilities(undefined, 'all')
          if (cancelled) return
          const fac = all.find((f: FacilityDto) => f.id === id)
          if (fac) {
            setTitle(fac.name)
            setSubtitle(`${fac.type} · ${fac.shortName}`)
          }
        }
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : 'Falha ao carregar.'
        toast.error('Erro', msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id, scope])

  return { title, subtitle, loading }
}

// Loader indicador (usado pelas telas de form internas).
export function HeaderLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="text-slate-400 animate-spin" />
    </div>
  )
}
