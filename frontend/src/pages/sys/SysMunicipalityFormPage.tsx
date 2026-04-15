import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin } from 'lucide-react'
import { sysApi } from '../../api/sys'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

export function SysMunicipalityFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  const [name, setName] = useState('')
  const [state, setState] = useState('GO')
  const [ibge, setIbge] = useState('')
  const [archived, setArchived] = useState(false)

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isEdit || !id) return
    sysApi.getMunicipality(id)
      .then(m => {
        setName(m.name); setState(m.state); setIbge(m.ibge); setArchived(m.archived)
      })
      .catch(e => setError(e instanceof HttpError ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Mínimo 2 caracteres'
    if (!UF_LIST.includes(state)) e.state = 'UF inválida'
    if (!isEdit && !/^\d{6,7}$/.test(ibge)) e.ibge = 'IBGE deve ter 6 ou 7 dígitos'
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
      if (isEdit && id) {
        await sysApi.updateMunicipality(id, { name, state })
        toast.success('Município atualizado', name)
        navigate(`/sys/municipios/${id}`, { replace: true })
      } else {
        const created = await sysApi.createMunicipality({ name, state, ibge })
        toast.success(
          'Município criado',
          `${created.name} provisionado no schema ${created.schemaName}.`,
        )
        navigate(`/sys/municipios/${created.id}`, { replace: true })
      }
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao salvar.'
      setError(msg)
      toast.error(isEdit ? 'Falha ao salvar alterações' : 'Falha ao criar município', msg)
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
        <button type="button" onClick={() => navigate('/sys/municipios')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {isEdit ? 'Editar município' : 'Novo município'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEdit
              ? archived ? 'Município arquivado. Edições não reativam automaticamente.' : 'Apenas nome e UF podem ser editados. IBGE é imutável.'
              : 'Ao criar, o backend provisiona o schema mun_<IBGE> automaticamente.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <Field label="Nome do município *" error={errors.name}>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex: Goiânia"
            className={inputCls(!!errors.name)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4">
          <Field label="UF *" error={errors.state}>
            <select value={state} onChange={e => setState(e.target.value)} className={inputCls(!!errors.state)}>
              {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
          <Field label="Código IBGE *" error={errors.ibge}>
            <div className="relative">
              <MapPin size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={ibge} onChange={e => setIbge(e.target.value.replace(/\D/g, '').slice(0, 7))}
                disabled={isEdit}
                placeholder="5208707"
                className={inputCls(!!errors.ibge) + ' pl-8 ' + (isEdit ? 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed' : '')}
              />
            </div>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => navigate('/sys/municipios')} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
          {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar município'}
        </button>
      </div>
    </form>
  )
}

function inputCls(hasError: boolean) {
  return (
    'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg outline-none transition-colors ' +
    'text-slate-800 dark:text-slate-200 placeholder-slate-400 ' +
    (hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-violet-400')
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
