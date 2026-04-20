import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { sysApi, type FacilityAdmin } from '../../api/sys'
import { directoryApi, type MunicipalityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { SYSTEMS } from '../../mock/users'
import type { SystemId } from '../../types'
import { cn } from '../../lib/utils'

const TYPES = ['SMS','UBS','UPA','Hospital','Lab','VISA','Policlínica','CEO','CAPS','Transportes','Outro']

export function SysFacilityFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const isEdit = !!id

  const [muns, setMuns] = useState<MunicipalityDto[]>([])
  const [municipalityId, setMunicipalityId] = useState(params.get('municipalityId') ?? '')
  const [name, setName]           = useState('')
  const [shortName, setShortName] = useState('')
  const [type, setType]           = useState('UBS')
  const [cnes, setCnes]           = useState('')

  // ``null`` = herda os módulos do município; array = personalização.
  const [enabledModules, setEnabledModules] = useState<SystemId[] | null>(null)
  // enabled_modules do município escolhido (pra saber o que o user pode marcar)
  const [munEnabledModules, setMunEnabledModules] = useState<SystemId[] | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [errors,  setErrors]  = useState<Record<string,string>>({})

  useEffect(() => {
    async function load() {
      try {
        const m = await directoryApi.listMunicipalities()
        setMuns(m)
        if (isEdit && id) {
          const facs = await directoryApi.listFacilities()
          const f = facs.find(x => x.id === id)
          if (f) {
            setMunicipalityId(f.municipalityId)
            setName(f.name); setShortName(f.shortName); setType(f.type); setCnes(f.cnes ?? '')
            setEnabledModules(
              (f.enabledModules as SystemId[] | null | undefined) ?? null,
            )
          }
        }
      } finally { setLoading(false) }
    }
    void load()
  }, [id, isEdit])

  // Sempre que trocar o município (ou no load), busca os enabled_modules dele.
  useEffect(() => {
    if (!municipalityId) { setMunEnabledModules(null); return }
    sysApi.getMunicipality(municipalityId)
      .then(m => {
        setMunEnabledModules((m.enabledModules as SystemId[] | undefined) ?? null)
      })
      .catch(() => setMunEnabledModules(null))
  }, [municipalityId])

  // Opções disponíveis pra marcar: se o município restringiu, só esses;
  // senão, todos os operacionais (SYSTEMS).
  const availableModules = useMemo<SystemId[]>(
    () => munEnabledModules ?? SYSTEMS.map(s => s.id as SystemId),
    [munEnabledModules],
  )

  const toggleModule = (m: SystemId) => {
    // Ao marcar pela primeira vez, deixa de herdar → vira lista.
    const curr = enabledModules ?? availableModules
    const next = curr.includes(m) ? curr.filter(x => x !== m) : [...curr, m]
    setEnabledModules(next)
  }

  const resetToInherit = () => setEnabledModules(null)

  const validate = () => {
    const e: Record<string,string> = {}
    if (!municipalityId) e.municipalityId = 'Selecione o município'
    if (name.trim().length < 2) e.name = 'Mínimo 2 caracteres'
    if (shortName.trim().length < 2) e.shortName = 'Mínimo 2 caracteres'
    if (!TYPES.includes(type)) e.type = 'Tipo inválido'
    if (cnes && !/^\d{7}$/.test(cnes)) e.cnes = 'CNES deve ter 7 dígitos'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setError('')
    if (!validate()) {
      toast.warning('Revise os campos', 'Existem erros de validação no formulário.')
      return
    }
    setSaving(true)
    try {
      // Se o user customizou (lista não-null), manda a lista; se está
      // herdando, manda null pro backend limpar a personalização.
      const payloadMods = enabledModules === null ? null : enabledModules.slice().sort()
      if (isEdit && id) {
        await sysApi.updateFacility(id, {
          name, shortName, type, cnes: cnes || null,
          enabledModules: payloadMods,
        })
        toast.success('Unidade atualizada', name)
      } else {
        await sysApi.createFacility({
          municipalityId, name, shortName, type, cnes: cnes || null,
          enabledModules: payloadMods,
        })
        toast.success('Unidade criada', `${shortName} cadastrada.`)
      }
      navigate('/sys/unidades', { replace: true })
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao salvar.'
      setError(msg)
      toast.error(isEdit ? 'Falha ao salvar alterações' : 'Falha ao criar unidade', msg)
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/sys/unidades')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {isEdit ? 'Editar unidade' : 'Nova unidade'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEdit ? 'Município vinculado não pode ser alterado.' : 'Unidade é criada dentro de um município.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <Field label="Município *" error={errors.municipalityId}>
          <select value={municipalityId} onChange={e => setMunicipalityId(e.target.value)}
            disabled={isEdit} className={inputCls(!!errors.municipalityId, isEdit)}>
            <option value="">Selecione...</option>
            {muns.map(m => <option key={m.id} value={m.id}>{m.name} – {m.state}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-4">
          <Field label="Nome completo *" error={errors.name}>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls(!!errors.name)} placeholder="Ex: Unidade Básica de Saúde Centro" />
          </Field>
          <Field label="Nome curto *" error={errors.shortName}>
            <input value={shortName} onChange={e => setShortName(e.target.value)} className={inputCls(!!errors.shortName)} placeholder="Ex: UBS Centro" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-4">
          <Field label="Tipo *" error={errors.type}>
            <select value={type} onChange={e => setType(e.target.value)} className={inputCls(!!errors.type)}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="CNES" error={errors.cnes}>
            <input value={cnes} onChange={e => setCnes(e.target.value.replace(/\D/g, '').slice(0, 7))}
              className={inputCls(!!errors.cnes)} placeholder="0000000" />
          </Field>
        </div>
      </div>

      {/* Módulos habilitados nesta unidade */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Módulos habilitados
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Quais sistemas aparecem pra quem opera nesta unidade. Por padrão
              herda tudo o que o município habilitou; você pode restringir
              (mas não ampliar — se o município desativou um módulo, ele não
              fica disponível aqui).
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 shrink-0">
            <input
              type="checkbox"
              checked={enabledModules === null}
              onChange={e => {
                if (e.target.checked) resetToInherit()
                else setEnabledModules(availableModules.slice())
              }}
            />
            Herdar do município
          </label>
        </div>

        {!municipalityId && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
            <Info size={13} className="shrink-0 mt-0.5" />
            Selecione o município primeiro pra ver os módulos disponíveis.
          </div>
        )}

        {municipalityId && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {SYSTEMS.map(sys => {
              const allowedByMun = availableModules.includes(sys.id as SystemId)
              const isChecked = enabledModules === null
                ? allowedByMun              // herdando = marca tudo que o mun permite
                : enabledModules.includes(sys.id as SystemId)
              const disabled = !allowedByMun || enabledModules === null
              return (
                <label
                  key={sys.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors',
                    disabled
                      ? 'border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-700 cursor-pointer hover:border-violet-400',
                    isChecked && !disabled && 'bg-violet-50 dark:bg-violet-950/30 border-violet-300 dark:border-violet-700',
                  )}
                  title={!allowedByMun ? 'Módulo não habilitado no município' : ''}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={disabled}
                    onChange={() => toggleModule(sys.id as SystemId)}
                  />
                  <span className="flex-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{sys.abbrev}</span>
                    <span className="text-slate-400 ml-1.5">{sys.name}</span>
                  </span>
                  {!allowedByMun && (
                    <span className="text-[10px] text-slate-400">mun desativou</span>
                  )}
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => navigate('/sys/unidades')} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
          {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar unidade'}
        </button>
      </div>
    </form>
  )
}

function inputCls(hasError: boolean, disabled = false) {
  return (
    'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg outline-none transition-colors ' +
    'text-slate-800 dark:text-slate-200 placeholder-slate-400 ' +
    (hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-violet-400') +
    (disabled ? ' bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : '')
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
