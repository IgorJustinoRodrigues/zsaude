import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, MapPin, Palette } from 'lucide-react'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { directoryApi, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { BrandingFields } from '../../components/shared/BrandingFields'

/**
 * Tela dedicada de personalização de identidade visual.
 *
 * Acessada via botão "Personalizar" nas listagens de municípios e unidades:
 *   - /sys/municipios/:id/personalizar
 *   - /sys/unidades/:id/personalizar
 *
 * Determinamos o scope pela URL (``/municipios/`` vs ``/unidades/``).
 */
export function SysMunicipalityBrandingPage() {
  return <BrandingPage scope="municipality" />
}

export function SysFacilityBrandingPage() {
  return <BrandingPage scope="facility" />
}

interface Props {
  scope: 'municipality' | 'facility'
}

function BrandingPage({ scope }: Props) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      try {
        if (scope === 'municipality') {
          const mun: MunicipalityAdminDetail = await sysApi.getMunicipality(id!)
          if (cancelled) return
          setTitle(mun.name)
          setSubtitle(`${mun.state} · IBGE ${mun.ibge}`)
        } else {
          // Facility não tem endpoint de detail direto; usa directory.
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

  const backHref = scope === 'municipality' ? '/sys/municipios' : '/sys/unidades'
  const scopeLabel = scope === 'municipality' ? 'município' : 'unidade'
  const ScopeIcon = scope === 'municipality' ? MapPin : Building2
  const inheritHint = scope === 'municipality'
    ? 'Esta identidade é a base usada por todas as unidades deste município — cada unidade pode sobrescrever campos individuais.'
    : 'Deixe um campo em branco pra herdar da cidade. A logo específica aqui substitui a da cidade só pra esta unidade.'

  if (!id) {
    return (
      <div className="text-sm text-red-500">Identificador inválido.</div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(backHref)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 mt-0.5"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <ScopeIcon size={12} />
            {scope === 'municipality' ? 'Município' : 'Unidade'}
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1 text-violet-500 font-medium">
              <Palette size={11} />
              Identidade visual
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
            {loading ? 'Carregando...' : title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        ) : (
          <BrandingFields
            scope={scope}
            scopeId={id}
            inheritHint={inheritHint}
          />
        )}
      </div>

      <p className="text-[11px] text-slate-400 text-center">
        Alterações valem a partir do próximo PDF/relatório gerado por esta {scopeLabel}.
      </p>
    </div>
  )
}
