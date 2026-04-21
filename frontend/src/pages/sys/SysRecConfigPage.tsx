// Tela 3: configuração de UMA seção do módulo Recepção (MASTER).
//
// Hoje o rec_config é bem magro: cada seção tem apenas um toggle
// ``enabled`` (e ``afterAttendance`` no caso de Recepção). Detalhes
// (captura do totem, modo do painel, áudio, setores) vivem nos
// painéis/totens lógicos — ver `/sys/{mun|unidade}/recursos`.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BellRing, Loader2, MonitorSmartphone, RotateCcw, Save, Users,
} from 'lucide-react'
import {
  recConfigApi,
  type AfterAttendance,
  type EffectiveRecConfig,
  type PainelConfig,
  type RecSection,
  type RecepcaoConfig,
  type TotemConfig,
} from '../../api/recConfig'
import { directoryApi } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'

type Scope = 'municipality' | 'facility'

const DEFAULT_TOTEM: TotemConfig = { enabled: true }
const DEFAULT_PAINEL: PainelConfig = { enabled: true }
const DEFAULT_RECEPCAO: RecepcaoConfig = { enabled: true, afterAttendance: 'triagem' }

export function SysMunicipalityRecSectionPage() {
  return <RecSectionPage scope="municipality" />
}

export function SysFacilityRecSectionPage() {
  return <RecSectionPage scope="facility" />
}

function RecSectionPage({ scope }: { scope: Scope }) {
  const navigate = useNavigate()
  const { id, section } = useParams<{ id: string; section: RecSection }>()
  const { title, subtitle, loading: loadingHeader } = useScopeHeader(scope, id)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rawSection, setRawSection] = useState<unknown>(null)
  const [effective, setEffective] = useState<EffectiveRecConfig | null>(null)
  const [parentEffective, setParentEffective] = useState<EffectiveRecConfig | null>(null)

  const load = useCallback(async () => {
    if (!id || !section) return
    setLoading(true)
    try {
      if (scope === 'municipality') {
        const [raw, eff] = await Promise.all([
          recConfigApi.getMunicipality(id),
          recConfigApi.effective({ municipalityId: id }),
        ])
        setRawSection((raw.config as Record<string, unknown> | null)?.[section] ?? null)
        setEffective(eff)
        setParentEffective(null)
      } else {
        const all = await directoryApi.listFacilities(undefined, 'all')
        const fac = all.find(f => f.id === id)
        const municipalityId = fac?.municipalityId
        const [raw, eff, parentEff] = await Promise.all([
          recConfigApi.getFacility(id),
          recConfigApi.effective({ facilityId: id }),
          municipalityId
            ? recConfigApi.effective({ municipalityId })
            : Promise.resolve(null),
        ])
        setRawSection((raw.config as Record<string, unknown> | null)?.[section] ?? null)
        setEffective(eff)
        setParentEffective(parentEff)
      }
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao carregar.'
      toast.error('Erro', msg)
    } finally {
      setLoading(false)
    }
  }, [id, scope, section])

  useEffect(() => { void load() }, [load])

  if (!id || !section) {
    return <div className="text-sm text-red-500">Parâmetros inválidos.</div>
  }

  const sectionsHref =
    scope === 'municipality'
      ? `/sys/municipios/${id}/modulos/rec`
      : `/sys/unidades/${id}/modulos/rec`

  async function save(payload: { totem?: TotemConfig; painel?: PainelConfig; recepcao?: RecepcaoConfig }) {
    if (!id) return
    setSaving(true)
    try {
      const body = { config: payload }
      if (scope === 'municipality') await recConfigApi.updateMunicipality(id, body)
      else await recConfigApi.updateFacility(id, body)
      toast.success('Salvo', 'Configuração atualizada.')
      await load()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao salvar.'
      toast.error('Erro', msg)
    } finally {
      setSaving(false)
    }
  }

  async function clearSection() {
    if (!id || !section) return
    setSaving(true)
    try {
      if (scope === 'municipality') await recConfigApi.clearMunicipalitySection(id, section)
      else await recConfigApi.clearFacilitySection(id, section)
      toast.success('Limpo', 'Seção voltou a herdar.')
      await load()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao limpar.'
      toast.error('Erro', msg)
    } finally {
      setSaving(false)
    }
  }

  const isPersonalized = rawSection !== null
  const inheritHint =
    scope === 'municipality'
      ? 'Este valor vira o padrão das unidades do município. Elas podem desabilitar, nunca reabilitar se o município desativou.'
      : 'Por padrão herda do município. Ao personalizar, só é possível restringir — o que a cidade desativa permanece desativado.'

  const meta = SECTION_META[section]
  const SectionIcon = meta.icon

  return (
    <div className="space-y-5">
      <ScopeHeader
        scope={scope}
        loading={loadingHeader}
        title={title}
        subtitle={subtitle}
        breadcrumb={
          <span className="flex items-center gap-1 text-teal-600 font-medium">
            <SectionIcon size={11} /> Recepção · {meta.label}
          </span>
        }
        onBack={() => navigate(sectionsHref)}
      />

      {loading || !effective ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300 flex items-center justify-center shrink-0">
              <SectionIcon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{meta.label}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{meta.subtitle}</p>
            </div>
            <StatusBadge personalized={isPersonalized} scope={scope} />
            {isPersonalized && (
              <button
                type="button"
                onClick={clearSection}
                disabled={saving}
                title={scope === 'municipality' ? 'Usar padrão do sistema' : 'Voltar a herdar do município'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={12} />
                {scope === 'municipality' ? 'Usar padrão' : 'Herdar'}
              </button>
            )}
          </div>

          <div className="p-5">
            {section === 'totem' && (
              <TotemForm
                initial={effective.totem}
                parent={parentEffective?.totem ?? null}
                saving={saving}
                onSave={v => save({ totem: v })}
              />
            )}
            {section === 'painel' && (
              <PainelForm
                initial={effective.painel}
                parent={parentEffective?.painel ?? null}
                saving={saving}
                onSave={v => save({ painel: v })}
              />
            )}
            {section === 'recepcao' && (
              <RecepcaoForm
                initial={effective.recepcao}
                parent={parentEffective?.recepcao ?? null}
                saving={saving}
                onSave={v => save({ recepcao: v })}
              />
            )}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
        {inheritHint}
      </p>

      {/* Link pros recursos lógicos */}
      {(section === 'totem' || section === 'painel') && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Detalhes de cada {section} (formas de captura, modo, áudio, setores) vivem em
          {' '}<a
            href={scope === 'municipality'
              ? `/sys/municipios/${id}/recursos/${section === 'painel' ? 'paineis' : 'totens'}`
              : `/sys/unidades/${id}/recursos/${section === 'painel' ? 'paineis' : 'totens'}`
            }
            className="text-teal-600 dark:text-teal-400 hover:underline font-medium"
          >
            Recursos → {section === 'painel' ? 'Painéis de chamada' : 'Totens'}
          </a>.
        </p>
      )}
    </div>
  )
}

// ─── Metadata ───────────────────────────────────────────────────────────────

const SECTION_META: Record<RecSection, { label: string; subtitle: string; icon: typeof BellRing }> = {
  totem: {
    label: 'Totem',
    subtitle: 'Autoatendimento do paciente',
    icon: MonitorSmartphone,
  },
  painel: {
    label: 'Painel de chamadas',
    subtitle: 'TV pública da recepção',
    icon: BellRing,
  },
  recepcao: {
    label: 'Atendimento (balcão)',
    subtitle: 'Console da atendente',
    icon: Users,
  },
}

function StatusBadge({ personalized, scope }: { personalized: boolean; scope: Scope }) {
  if (personalized) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
        Personalizado
      </span>
    )
  }
  const label = scope === 'municipality' ? 'Padrão do sistema' : 'Herdado'
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      {label}
    </span>
  )
}

// ─── Forms ──────────────────────────────────────────────────────────────────

interface FormProps<T> {
  initial: T
  parent: T | null
  saving: boolean
  onSave: (v: T) => void
}

function TotemForm({ initial, parent, saving, onSave }: FormProps<TotemConfig>) {
  const [draft, setDraft] = useState(initial)
  useEffect(() => { setDraft(initial) }, [initial])

  const parentDisabled = parent !== null && !parent.enabled
  useEffect(() => {
    if (parentDisabled && draft.enabled) setDraft({ ...draft, enabled: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentDisabled])

  return (
    <div className="space-y-5">
      {parentDisabled && (
        <ParentLockBanner reason="O município desativou o totem — esta unidade não pode habilitar." />
      )}
      <MasterToggle
        label="Totem ativo"
        description="Desligar aqui desativa o totem inteiro. Detalhes (captura de documento, prioridade etc.) ficam em Recursos → Totens."
        checked={draft.enabled}
        onChange={b => setDraft({ ...draft, enabled: b })}
        disabled={parentDisabled}
      />
      <FormFooter saving={saving} onSave={() => onSave(draft)} />
    </div>
  )
}

void DEFAULT_TOTEM; void DEFAULT_PAINEL; void DEFAULT_RECEPCAO  // reservados pra futuro

function PainelForm({ initial, parent, saving, onSave }: FormProps<PainelConfig>) {
  const [draft, setDraft] = useState(initial)
  useEffect(() => { setDraft(initial) }, [initial])

  const parentDisabled = parent !== null && !parent.enabled
  useEffect(() => {
    if (parentDisabled && draft.enabled) setDraft({ ...draft, enabled: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentDisabled])

  return (
    <div className="space-y-5">
      {parentDisabled && (
        <ParentLockBanner reason="O município desativou o painel — esta unidade não pode habilitar." />
      )}
      <MasterToggle
        label="Painel ativo"
        description="Desligar aqui desativa o painel de chamadas inteiro. Configurações por painel (modo, áudio, setores) ficam em Recursos → Painéis."
        checked={draft.enabled}
        onChange={b => setDraft({ ...draft, enabled: b })}
        disabled={parentDisabled}
      />
      <FormFooter saving={saving} onSave={() => onSave(draft)} />
    </div>
  )
}

function RecepcaoForm({ initial, parent, saving, onSave }: FormProps<RecepcaoConfig>) {
  const [draft, setDraft] = useState(initial)
  useEffect(() => { setDraft(initial) }, [initial])

  const parentDisabled = parent !== null && !parent.enabled
  useEffect(() => {
    if (parentDisabled && draft.enabled) setDraft({ ...draft, enabled: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentDisabled])

  const labels: Record<AfterAttendance, string> = {
    triagem: 'Triagem',
    consulta: 'Consulta',
    nenhum: 'Nenhum',
  }

  return (
    <div className="space-y-5">
      {parentDisabled && (
        <ParentLockBanner reason="O município desativou o atendimento — esta unidade não pode habilitar." />
      )}
      <MasterToggle
        label="Atendimento ativo"
        description="Desligar aqui desativa o balcão de recepção. Use quando este escopo não tem recepcionista."
        checked={draft.enabled}
        onChange={b => setDraft({ ...draft, enabled: b })}
        disabled={parentDisabled}
      />
      <fieldset className={cn('space-y-4', !draft.enabled && 'opacity-50 pointer-events-none')}>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">
            Após o atendimento, encaminhar para
          </p>
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(Object.keys(labels) as AfterAttendance[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setDraft({ ...draft, afterAttendance: k })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  draft.afterAttendance === k
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                )}
              >
                {labels[k]}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
      <FormFooter saving={saving} onSave={() => onSave(draft)} />
    </div>
  )
}

// ─── Primitivos ──────────────────────────────────────────────────────────────

function FormFooter({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Salvar
      </button>
    </div>
  )
}

function MasterToggle({
  label, description, checked, onChange, disabled,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (b: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 p-4 rounded-xl border transition-colors',
        checked
          ? 'border-teal-200 bg-teal-50/50 dark:border-teal-900/40 dark:bg-teal-500/5'
          : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40',
        disabled && 'opacity-60',
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
          checked ? 'bg-teal-600' : 'bg-slate-400 dark:bg-slate-600',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
          <span className={cn(
            'text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded',
            checked
              ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300'
              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
          )}>
            {checked ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function ParentLockBanner({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50">
      <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-amber-700 dark:text-amber-400 text-[10px] font-bold">!</span>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{reason}</p>
    </div>
  )
}
