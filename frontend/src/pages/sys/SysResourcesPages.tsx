// Shell genérico de "Recursos" — cadastros compartilhados entre módulos
// (setores, futuros: salas, equipamentos, etc).
//
// Estrutura:
//   /sys/municipios/:id/recursos             → tela 1: lista de recursos
//   /sys/municipios/:id/recursos/:resource   → tela 2: a gestão daquele recurso
//
// Mesmo padrão pra /sys/unidades/:id/recursos/...

import { useNavigate, useParams } from 'react-router-dom'
import { BellRing, ChevronRight, LayoutList, MonitorSmartphone, type LucideIcon } from 'lucide-react'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'
import { cn } from '../../lib/utils'

type Scope = 'municipality' | 'facility'

interface Resource {
  id: string
  label: string
  description: string
  icon: LucideIcon
  accent: string
}

/** Recursos cadastrados — cresce conforme formos adicionando.  */
const RESOURCES: Resource[] = [
  {
    id: 'setores',
    label: 'Setores',
    description: 'Catálogo usado pelos painéis e encaminhamentos internos',
    icon: LayoutList,
    accent: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  },
  {
    id: 'paineis',
    label: 'Painéis de chamada',
    description: 'Configurações nomeadas — vinculadas a um dispositivo TV',
    icon: BellRing,
    accent: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  },
  {
    id: 'totens',
    label: 'Totens',
    description: 'Configurações do autoatendimento — vinculadas a um dispositivo totem',
    icon: MonitorSmartphone,
    accent: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  },
]

export function SysMunicipalityResourcesPage() {
  return <ResourcesPage scope="municipality" />
}

export function SysFacilityResourcesPage() {
  return <ResourcesPage scope="facility" />
}

function ResourcesPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { title, subtitle, loading } = useScopeHeader(scope, id)

  const backHref = scope === 'municipality' ? '/sys/municipios' : '/sys/unidades'
  const basePath =
    scope === 'municipality' ? `/sys/municipios/${id}/recursos` : `/sys/unidades/${id}/recursos`

  const hint =
    scope === 'municipality'
      ? 'Cadastros compartilhados do município — usados por todas as unidades, com opção de personalizar por unidade.'
      : 'Cadastros desta unidade. Cada recurso pode herdar do município ou ter lista própria.'

  return (
    <div className="space-y-6">
      <ScopeHeader
        scope={scope}
        loading={loading}
        title={title}
        subtitle={subtitle}
        breadcrumb={<span className="flex items-center gap-1 text-violet-600 font-medium"><LayoutList size={11} /> Recursos</span>}
        onBack={() => navigate(backHref)}
      />

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        {hint}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {RESOURCES.map(r => {
          const Icon = r.icon
          return (
            <button
              key={r.id}
              onClick={() => navigate(`${basePath}/${r.id}`)}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-left hover:border-violet-400/60 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-start gap-4"
            >
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', r.accent)}>
                <Icon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{r.label}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.description}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all mt-1.5 shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
