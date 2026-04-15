import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { sysApi } from '../../api/sys'
import { directoryApi, type MunicipalityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'

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
          }
        }
      } finally { setLoading(false) }
    }
    void load()
  }, [id, isEdit])

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
    if (!validate()) return
    setSaving(true)
    try {
      if (isEdit && id) {
        await sysApi.updateFacility(id, { name, shortName, type, cnes: cnes || null })
      } else {
        await sysApi.createFacility({ municipalityId, name, shortName, type, cnes: cnes || null })
      }
      navigate('/sys/unidades', { replace: true })
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'Erro ao salvar.')
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
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
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
