// Tela 3: configuração de UMA seção do módulo Recepção (MASTER).
//
// Hoje o rec_config é bem magro: cada seção tem apenas um toggle
// ``enabled`` (e ``afterAttendance`` no caso de Recepção). Detalhes
// (captura do totem, modo do painel, áudio, setores) vivem nos
// painéis/totens lógicos — ver `/sys/{mun|unidade}/recursos`.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownUp, BellRing, Clock, Loader2, MonitorSmartphone, RotateCcw, Save,
  Sparkles, Star, Users,
} from 'lucide-react'
import {
  recConfigApi,
  type EffectiveRecConfig,
  type PainelConfig,
  type PainelMode,
  type QueueOrderMode,
  type RecSection,
  type RecepcaoConfig,
  type TotemConfig,
} from '../../api/recConfig'
import { sectorsAdminApi, type Sector } from '../../api/sectors'
import { directoryApi } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { ScopeHeader, useScopeHeader } from './SysModulesConfigPages'

type Scope = 'municipality' | 'facility'

const DEFAULT_TOTEM: TotemConfig = { enabled: true }
const DEFAULT_PAINEL: PainelConfig = { enabled: true, mode: 'senha' }
const DEFAULT_RECEPCAO: RecepcaoConfig = {
  enabled: true,
  afterAttendanceSector: null,
  forwardSectorNames: null,
  queueOrderMode: 'priority_fifo',
}

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
  const [sectors, setSectors] = useState<Sector[]>([])

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

  // Carrega setores disponíveis no escopo — usados no select "após atender".
  useEffect(() => {
    if (!id || section !== 'recepcao') return
    const fetch = scope === 'municipality'
      ? sectorsAdminApi.listMunicipality(id)
      : sectorsAdminApi.listFacility(id)
    fetch
      .then(list => setSectors(list.filter(s => !s.archived)))
      .catch(() => { /* silencioso — campo continua funcionando em modo livre */ })
  }, [id, scope, section])

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
                sectors={sectors}
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
        description="Desligar aqui desativa o painel de chamadas inteiro."
        checked={draft.enabled}
        onChange={b => setDraft({ ...draft, enabled: b })}
        disabled={parentDisabled}
      />
      <fieldset className={cn('space-y-3', !draft.enabled && 'opacity-50 pointer-events-none')}>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            Exibição das chamadas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl">
            <ModeOption
              mode="senha"
              label="Senha"
              description="Só o número da senha em destaque."
              preview="R-047"
              selected={draft.mode === 'senha'}
              onSelect={() => setDraft({ ...draft, mode: 'senha' })}
            />
            <ModeOption
              mode="nome"
              label="Nome"
              description="Só o nome do paciente."
              preview="Ana Ferreira"
              previewSmall
              selected={draft.mode === 'nome'}
              onSelect={() => setDraft({ ...draft, mode: 'nome' })}
            />
            <ModeOption
              mode="ambos"
              label="Senha + nome"
              description="Nome em destaque, senha menor acima."
              preview="Ana Ferreira"
              previewSub="R-047"
              subOnTop
              selected={draft.mode === 'ambos'}
              onSelect={() => setDraft({ ...draft, mode: 'ambos' })}
            />
          </div>
        </div>
      </fieldset>
      <FormFooter saving={saving} onSave={() => onSave(draft)} />
    </div>
  )
}

function ModeOption({
  label, description, preview, previewSub, previewSmall, subOnTop, selected, onSelect,
}: {
  mode: PainelMode
  label: string
  description: string
  preview: string
  previewSub?: string
  previewSmall?: boolean
  /** Quando true, o ``previewSub`` aparece acima do ``preview`` principal. */
  subOnTop?: boolean
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'text-left rounded-xl border-2 p-3 transition-all',
        selected
          ? 'border-teal-400 dark:border-teal-600 bg-teal-50/60 dark:bg-teal-950/30 shadow-sm'
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900',
      )}
    >
      <div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-3 mb-2 text-center overflow-hidden">
        {subOnTop && previewSub && (
          <p className="text-[10px] font-bold tabular-nums text-teal-400 mb-1 truncate">
            {previewSub}
          </p>
        )}
        <p
          className={cn(
            'font-black tracking-tight text-white truncate',
            previewSmall ? 'text-lg' : subOnTop ? 'text-lg' : 'text-3xl tabular-nums',
          )}
        >
          {preview}
        </p>
        {!subOnTop && previewSub && (
          <p className="text-[10px] text-white/70 mt-1 truncate">{previewSub}</p>
        )}
      </div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
        {description}
      </p>
    </button>
  )
}

function RecepcaoForm({
  initial, parent, sectors, saving, onSave,
}: FormProps<RecepcaoConfig> & { sectors: Sector[] }) {
  const [draft, setDraft] = useState(initial)
  useEffect(() => { setDraft(initial) }, [initial])

  const parentDisabled = parent !== null && !parent.enabled
  useEffect(() => {
    if (parentDisabled && draft.enabled) setDraft({ ...draft, enabled: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentDisabled])

  // Se o valor salvo é um setor que não está mais na lista (renomeado/
  // arquivado), deixa ele disponível no select pra não "sumir" sozinho.
  const currentSaved = draft.afterAttendanceSector
  const missingSector = currentSaved && !sectors.some(s => s.name === currentSaved)

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
      <fieldset className={cn('space-y-6', !draft.enabled && 'opacity-50 pointer-events-none')}>
        <div>
          <label className="block text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
            Após o atendimento, encaminhar para
          </label>
          <select
            value={draft.afterAttendanceSector ?? ''}
            onChange={e => setDraft({
              ...draft,
              afterAttendanceSector: e.target.value || null,
            })}
            className="w-full max-w-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Nenhum — concluir na recepção</option>
            {sectors.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
            {missingSector && (
              <option value={currentSaved!}>
                {currentSaved} (setor não encontrado)
              </option>
            )}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            {draft.afterAttendanceSector
              ? `O atendimento vai direto pra fila de ${draft.afterAttendanceSector} após a recepção.`
              : 'O atendimento conclui ao fim da recepção — sem encaminhamento.'}{' '}
            A atendente ainda pode escolher outro setor manualmente no momento de encaminhar.
          </p>
        </div>

        <ForwardSectorsPicker
          sectors={sectors}
          value={draft.forwardSectorNames}
          onChange={v => setDraft({ ...draft, forwardSectorNames: v })}
        />

        <QueueOrderPicker
          value={draft.queueOrderMode}
          onChange={m => setDraft({ ...draft, queueOrderMode: m })}
        />
      </fieldset>
      <FormFooter saving={saving} onSave={() => onSave(draft)} />
    </div>
  )
}

// ─── Setores disponíveis no encaminhamento ──────────────────────────────────

function ForwardSectorsPicker({
  sectors, value, onChange,
}: {
  sectors: Sector[]
  value: string[] | null
  onChange: (v: string[] | null) => void
}) {
  // null = todos (modo "Todos"). Quando vira lista, a UI mostra só os
  // marcados como "ligados".
  const isAll = value === null
  const selected = new Set(value ?? sectors.map(s => s.name))

  function toggle(name: string) {
    // Primeira interação: converte o "todos implícito" numa lista real
    // copiando os atuais, pra não afetar setores futuros.
    const base = isAll ? new Set(sectors.map(s => s.name)) : new Set(selected)
    if (base.has(name)) base.delete(name)
    else base.add(name)
    onChange(Array.from(base))
  }
  function setAll() { onChange(null) }
  function setNone() { onChange([]) }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <label className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Setores disponíveis no encaminhamento
        </label>
        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={setAll}
            className={cn(
              'px-2 py-0.5 rounded',
              isAll
                ? 'bg-teal-600 text-white font-semibold'
                : 'text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30',
            )}
          >
            Todos
          </button>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <button
            type="button"
            onClick={setNone}
            className="px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Limpar
          </button>
        </div>
      </div>

      {sectors.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          Nenhum setor cadastrado neste escopo. Crie em Recursos → Setores.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {sectors.map(s => {
            const on = selected.has(s.name)
            return (
              <label
                key={s.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                  on
                    ? 'border-teal-300 dark:border-teal-700 bg-teal-50/40 dark:bg-teal-950/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(s.name)}
                  className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 shrink-0 min-w-[2.5rem] text-center">
                  {s.abbreviation || '—'}
                </span>
                <span className="flex-1 text-sm truncate">{s.name}</span>
              </label>
            )
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
        {isAll
          ? 'Todos os setores do escopo (inclusive novos que vierem a ser criados) aparecem no encaminhamento.'
          : `${selected.size} de ${sectors.length} setores selecionados. Setores novos criados depois NÃO serão incluídos automaticamente — ajuste aqui quando quiser adicionar.`}
      </p>
    </div>
  )
}

// ─── Ordenamento da fila ─────────────────────────────────────────────────────

interface QueueOrderOption {
  key: QueueOrderMode
  title: string
  shortTitle: string
  icon: React.ReactNode
  accent: string
  description: string
  howWorks: string[]
  indicated: string[]
}

const QUEUE_ORDER_OPTIONS: QueueOrderOption[] = [
  {
    key: 'fifo',
    title: 'Ordem de chegada',
    shortTitle: 'FIFO',
    icon: <Clock size={16} />,
    accent: 'emerald',
    description: 'Atende exatamente na ordem em que as pessoas chegam.',
    howWorks: [
      'Primeiro que chega → primeiro atendido',
      'Sem distinção de prioridade',
    ],
    indicated: [
      'Serviços rápidos',
      'Baixo volume de pessoas',
      'Ambientes sem prioridade legal',
    ],
  },
  {
    key: 'priority_fifo',
    title: 'Chegada com prioridade intercalada',
    shortTitle: 'Prioridade 2:1',
    icon: <Star size={16} />,
    accent: 'sky',
    description: 'Mantém a ordem de chegada, intercalando prioridades.',
    howWorks: [
      'Separa fila normal e prioritária',
      'Atende 2 prioritários → 1 normal',
      'Ex.: P1 · P2 · N1 · P3 · N2 · N3…',
    ],
    indicated: [
      'Prefeituras e saúde pública',
      'Atendimento com exigência legal',
      'Maioria das recepções',
    ],
  },
  {
    key: 'ai',
    title: 'Ordenamento inteligente (IA)',
    shortTitle: 'IA',
    icon: <Sparkles size={16} />,
    accent: 'violet',
    description: 'Organiza dinamicamente conforme a demanda em tempo real.',
    howWorks: [
      'Analisa volume, tempo de espera e tipo',
      'Limita prioritários se a fila normal crescer',
      'Quem espera muito sobe na fila',
    ],
    indicated: [
      'Alto volume de atendimento',
      'Hospitais e centrais',
      'Cidades grandes',
    ],
  },
]

const ACCENT_CLASSES: Record<string, { border: string; bg: string; icon: string; badge: string }> = {
  emerald: {
    border: 'border-emerald-400 dark:border-emerald-600',
    bg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
    icon: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-600 text-white',
  },
  sky: {
    border: 'border-sky-400 dark:border-sky-600',
    bg: 'bg-sky-50/60 dark:bg-sky-950/30',
    icon: 'bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300',
    badge: 'bg-sky-600 text-white',
  },
  violet: {
    border: 'border-violet-400 dark:border-violet-600',
    bg: 'bg-violet-50/60 dark:bg-violet-950/30',
    icon: 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300',
    badge: 'bg-violet-600 text-white',
  },
}

function QueueOrderPicker({
  value, onChange,
}: { value: QueueOrderMode; onChange: (m: QueueOrderMode) => void }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 inline-flex items-center gap-1.5">
        <ArrowDownUp size={11} /> Ordenação da fila
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {QUEUE_ORDER_OPTIONS.map(opt => {
          const selected = opt.key === value
          const accent = ACCENT_CLASSES[opt.accent]
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={cn(
                'text-left rounded-xl border-2 p-4 flex flex-col gap-3 transition-all',
                selected
                  ? `${accent.border} ${accent.bg} shadow-sm`
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', accent.icon)}>
                  {opt.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {opt.title}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">
                    {opt.shortTitle}
                  </p>
                </div>
                {selected && (
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', accent.badge)}>
                    Ativo
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {opt.description}
              </p>

              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Como funciona
                </p>
                <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {opt.howWorks.map((h, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Indicado para
                </p>
                <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {opt.indicated.map((i, idx) => (
                    <li key={idx} className="flex gap-1.5">
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </button>
          )
        })}
      </div>
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
