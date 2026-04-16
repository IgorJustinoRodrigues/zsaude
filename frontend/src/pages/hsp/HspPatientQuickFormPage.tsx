import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { FormField } from '../../components/ui/FormField'
import { MaskedInput } from '../../components/ui/MaskedInput'
import { DuplicateBanner } from './components/DuplicateBanner'
import { useDuplicateCheck } from './hooks/useDuplicateCheck'
import { HttpError } from '../../api/client'
import { hspApi, type Sex } from '../../api/hsp'
import { toast } from '../../store/toastStore'
import { cnsMask, cpfMask } from '../../lib/masks'
import { validateBirthDate, validateCns, validateCpf } from '../../lib/validators'
import { cn } from '../../lib/utils'

interface QuickForm {
  name: string
  socialName: string
  sex: Sex | ''
  cpf: string
  birthDate: string
  cns: string
}

const EMPTY: QuickForm = {
  name: '', socialName: '', sex: '', cpf: '', birthDate: '', cns: '',
}

export function HspPatientQuickFormPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<QuickForm>(EMPTY)
  const [touched, setTouched] = useState<Set<keyof QuickForm>>(new Set())
  const [submitTried, setSubmitTried] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof QuickForm>(key: K, value: QuickForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setTouched(prev => prev.has(key) ? prev : new Set(prev).add(key))
  }

  const errors = useMemo(() => {
    const e: Partial<Record<keyof QuickForm, string | null>> = {}
    if (!form.name.trim()) e.name = 'Nome é obrigatório.'
    if (!form.sex) e.sex = 'Sexo é obrigatório.'
    if (form.cpf) e.cpf = validateCpf(form.cpf)
    if (form.cns) e.cns = validateCns(form.cns)
    if (form.birthDate) e.birthDate = validateBirthDate(form.birthDate)
    return e
  }, [form])

  const totalErrors = Object.values(errors).filter(Boolean).length

  const { match: duplicate } = useDuplicateCheck({ cpf: form.cpf, cns: form.cns })

  const showError = (key: keyof QuickForm) => {
    if (!submitTried && !touched.has(key)) return null
    return errors[key] ?? null
  }

  const handleSubmit = async () => {
    setSubmitTried(true)
    if (totalErrors > 0) {
      toast.error(`Corrija ${totalErrors} ${totalErrors === 1 ? 'erro' : 'erros'} antes de salvar.`)
      return
    }
    setSaving(true)
    try {
      const created = await hspApi.create({
        name: form.name.trim(),
        socialName: form.socialName.trim(),
        sex: form.sex || null,
        cpf: form.cpf || null,
        birthDate: form.birthDate || null,
        cns: form.cns || null,
      })
      toast.success('Paciente cadastrado.', 'Edite o cadastro para completar as informações.')
      navigate(`/hsp/pacientes/${created.id}`)
    } catch (err) {
      if (err instanceof HttpError) toast.error(err.message)
      else toast.error('Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Novo paciente"
        subtitle="Cadastro rápido — só os dados essenciais"
        back="/hsp/pacientes"
      />

      <div className="bg-white rounded-xl border border-border p-6 space-y-5">
        <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
          Preencha o essencial para identificar o paciente. Após salvar, você será
          levado para a tela do paciente onde pode adicionar endereço, documentos,
          foto e demais informações.
        </p>

        {duplicate && <DuplicateBanner match={duplicate} />}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Linha 1: Nome + Sexo */}
          <div className="md:col-span-8">
            <FormField label="Nome completo" required error={showError('name')}>
              <input
                autoFocus
                value={form.name}
                onChange={e => set('name', e.target.value)}
                onBlur={() => setTouched(t => new Set(t).add('name'))}
                className={baseInput(showError('name'))}
                placeholder="Como aparece no documento"
              />
            </FormField>
          </div>
          <div className="md:col-span-4">
            <FormField label="Sexo" required error={showError('sex')}>
              <select
                value={form.sex}
                onChange={e => set('sex', e.target.value as Sex | '')}
                onBlur={() => setTouched(t => new Set(t).add('sex'))}
                className={baseInput(showError('sex'))}
              >
                <option value="">Selecione...</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
                <option value="I">Intersexo / Indeterminado</option>
              </select>
            </FormField>
          </div>

          {/* Linha 2: Nome social + Nascimento */}
          <div className="md:col-span-8">
            <FormField label="Nome social" hint="Como prefere ser chamado(a)">
              <input
                value={form.socialName}
                onChange={e => set('socialName', e.target.value)}
                className={baseInput(null)}
              />
            </FormField>
          </div>
          <div className="md:col-span-4">
            <FormField label="Nascimento" error={showError('birthDate')} hint="Opcional">
              <input
                type="date"
                value={form.birthDate}
                onChange={e => set('birthDate', e.target.value)}
                className={baseInput(showError('birthDate'))}
              />
            </FormField>
          </div>

          {/* Linha 3: CPF + CNS */}
          <div className="md:col-span-4">
            <FormField label="CPF" error={showError('cpf')}
              valid={!!form.cpf && !errors.cpf} hint="Opcional">
              <MaskedInput
                value={form.cpf}
                onChange={v => set('cpf', v)}
                onBlur={() => setTouched(t => new Set(t).add('cpf'))}
                mask={cpfMask}
                invalid={!!showError('cpf')}
                placeholder="000.000.000-00"
              />
            </FormField>
          </div>
          <div className="md:col-span-8">
            <FormField label="CNS" hint="Cartão Nacional de Saúde — opcional"
              error={showError('cns')} valid={!!form.cns && !errors.cns}>
              <MaskedInput
                value={form.cns}
                onChange={v => set('cns', v)}
                onBlur={() => setTouched(t => new Set(t).add('cns'))}
                mask={cnsMask}
                invalid={!!showError('cns')}
                placeholder="000 0000 0000 0000"
              />
            </FormField>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          {submitTried && totalErrors > 0 && (
            <span className="text-xs text-rose-600 flex items-center gap-1">
              <AlertCircle size={13} />
              {totalErrors} erro{totalErrors !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar e abrir paciente'}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function baseInput(error: string | null | undefined) {
  return cn(
    'text-sm border rounded-lg bg-background px-3 py-2 w-full focus:outline-none focus:ring-2',
    error
      ? 'border-rose-300 focus:ring-rose-200 focus:border-rose-400'
      : 'border-border focus:ring-primary/20 focus:border-primary',
  )
}
