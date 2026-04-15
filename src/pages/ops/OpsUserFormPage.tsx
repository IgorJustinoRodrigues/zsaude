import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp,
  Camera, User, Eye, EyeOff, RefreshCw, Check, X,
} from 'lucide-react'
import { mockUsers, mockMunicipalities, mockFacilities } from '../../mock/users'
import { PhotoCropModal } from '../../components/ui/PhotoCropModal'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'

const ALL_MODULES: { id: SystemId; label: string; color: string }[] = [
  { id: 'cln', label: 'Clínica',     color: '#0ea5e9' },
  { id: 'dgn', label: 'Diagnóstico', color: '#8b5cf6' },
  { id: 'hsp', label: 'Hospitalar',  color: '#f59e0b' },
  { id: 'pln', label: 'Planos',      color: '#10b981' },
  { id: 'fsc', label: 'Fiscal',      color: '#f97316' },
  { id: 'ops', label: 'Operações',   color: '#6b7280' },
]

const ROLES = [
  'Administrador do Sistema', 'Gestor Regional', 'Supervisor Clínico',
  'Analista', 'Recepcionista', 'Médico', 'Enfermeiro',
  'Técnico de Enfermagem', 'Fisioterapeuta', 'Psicólogo',
  'Assistente Social', 'Consultor Externo',
]

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]

// ── Máscaras ──────────────────────────────────────────────────────────────────

function maskCpf(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

function maskCep(v: string) {
  return v.replace(/\D/g, '').slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2')
}

// ── Gerador de senha ──────────────────────────────────────────────────────────

const CHARSET = {
  upper:   'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower:   'abcdefghijklmnopqrstuvwxyz',
  digit:   '0123456789',
  special: '!@#$%&*',
}

function generatePassword(length = 12): string {
  const all = CHARSET.upper + CHARSET.lower + CHARSET.digit + CHARSET.special
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  // garante ao menos 1 de cada categoria
  const required = [pick(CHARSET.upper), pick(CHARSET.lower), pick(CHARSET.digit), pick(CHARSET.special)]
  const rest = Array.from({ length: length - required.length }, () => pick(all))
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('')
}

interface PasswordRules {
  length: boolean
  upper: boolean
  lower: boolean
  digit: boolean
  special: boolean
}

function checkPassword(pwd: string): PasswordRules {
  return {
    length:  pwd.length >= 8,
    upper:   /[A-Z]/.test(pwd),
    lower:   /[a-z]/.test(pwd),
    digit:   /[0-9]/.test(pwd),
    special: /[!@#$%&*]/.test(pwd),
  }
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FacilityAccess {
  facilityId: string
  role: string
  modules: SystemId[]
}

interface MunicipalityAccess {
  municipalityId: string
  expanded: boolean
  facilities: FacilityAccess[]
}

const emptyFacility     = (): FacilityAccess      => ({ facilityId: '', role: '', modules: [] })
const emptyMunicipality = (): MunicipalityAccess  => ({ municipalityId: '', expanded: true, facilities: [emptyFacility()] })

// ── Componente principal ──────────────────────────────────────────────────────

export function OpsUserFormPage() {
  const navigate   = useNavigate()
  const { id }     = useParams<{ id: string }>()
  const isEdit     = !!id
  const existing   = useMemo(() => mockUsers.find(u => u.id === id), [id])

  // Dados pessoais
  const [photo,        setPhoto]        = useState<string | null>(existing?.avatar ?? null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [name,         setName]         = useState(existing?.name ?? '')
  const [cpf,          setCpf]          = useState(existing?.cpf ?? '')
  const [email,        setEmail]        = useState(existing?.email ?? '')
  const [whatsapp,     setWhatsapp]     = useState(existing?.phone ?? '')

  // Endereço
  const [cep,          setCep]          = useState('')
  const [street,       setStreet]       = useState('')
  const [number,       setNumber]       = useState('')
  const [complement,   setComplement]   = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city,         setCity]         = useState('')
  const [addrState,    setAddrState]    = useState('')

  // Senha
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Acessos — converte o formato do mock para o formato interno do form
  const initialAccesses = useMemo<MunicipalityAccess[]>(() => {
    if (!existing) return [emptyMunicipality()]
    return existing.municipalities.map(m => ({
      municipalityId: m.municipalityId,
      expanded: true,
      facilities: m.facilities.map(f => ({
        facilityId: f.facilityId,
        role: f.role,
        modules: f.modules,
      })),
    }))
  }, [existing])

  const [accesses, setAccesses] = useState<MunicipalityAccess[]>(initialAccesses)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const pwdRules = checkPassword(password)
  const pwdValid = Object.values(pwdRules).every(Boolean)

  const handleGenerate = () => {
    const pwd = generatePassword()
    setPassword(pwd)
    setShowPassword(true)
  }

  // Acessos helpers
  const addMunicipality    = () => setAccesses(a => [...a, emptyMunicipality()])
  const removeMunicipality = (mi: number) => setAccesses(a => a.filter((_, i) => i !== mi))
  const toggleMunicipality = (mi: number) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, expanded: !m.expanded } : m))
  const setMunicipality    = (mi: number, id: string) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, municipalityId: id } : m))
  const addFacility        = (mi: number) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, facilities: [...m.facilities, emptyFacility()] } : m))
  const removeFacility     = (mi: number, fi: number) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, facilities: m.facilities.filter((_, j) => j !== fi) } : m))

  const setFacilityField = (mi: number, fi: number, field: keyof FacilityAccess, value: string) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? { ...m, facilities: m.facilities.map((f, j) => j === fi ? { ...f, [field]: value } : f) }
      : m
    ))

  const toggleModule = (mi: number, fi: number, mod: SystemId) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? { ...m, facilities: m.facilities.map((f, j) => j === fi
          ? { ...f, modules: f.modules.includes(mod) ? f.modules.filter(x => x !== mod) : [...f.modules, mod] }
          : f
        )}
      : m
    ))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim())    e.name     = 'Campo obrigatório'
    if (!cpf.trim())     e.cpf      = 'Campo obrigatório'
    if (!email.trim())   e.email    = 'Campo obrigatório'
    if (!isEdit) {
      if (!password)      e.password = 'Campo obrigatório'
      else if (!pwdValid) e.password = 'A senha não atende aos requisitos'
    } else if (password && !pwdValid) {
      e.password = 'A senha não atende aos requisitos'
    }
    accesses.forEach((m, mi) => {
      if (!m.municipalityId) e[`mun-${mi}`] = 'Selecione o município'
      m.facilities.forEach((f, fi) => {
        if (!f.facilityId)     e[`fac-${mi}-${fi}`]  = 'Selecione a unidade'
        if (!f.role)           e[`role-${mi}-${fi}`] = 'Selecione o cargo'
        if (!f.modules.length) e[`mod-${mi}-${fi}`]  = 'Selecione ao menos um módulo'
      })
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    navigate(isEdit ? `/ops/usuarios/${id}` : '/ops/usuarios')
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-0">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate('/ops/usuarios')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {isEdit ? `Editar usuário` : 'Cadastro de usuário'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEdit ? (existing?.name ?? '') : 'Preencha os dados e configure os acessos'}
          </p>
        </div>
      </div>

      {/* ── Seção 1: Dados pessoais ────────────────────────────────────────── */}
      <FormSection title="Dados pessoais" subtitle="Identificação e informações de contato do usuário">
        <div className="flex flex-col sm:flex-row gap-6">

          {/* Avatar */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <button type="button" onClick={() => setShowPhotoModal(true)}
              className="relative w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 transition-colors overflow-hidden group">
              {photo
                ? <img src={photo} alt="Foto" className="w-full h-full object-cover" />
                : <User size={32} className="text-slate-300 dark:text-slate-600 absolute inset-0 m-auto" />
              }
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                <Camera size={18} className="text-white" />
              </div>
            </button>
            <button type="button" onClick={() => setShowPhotoModal(true)}
              className="text-[11px] text-sky-500 hover:text-sky-600 transition-colors">
              {photo ? 'Alterar foto' : 'Adicionar foto'}
            </button>
          </div>

          {/* Campos */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4">
            <Field label="Nome completo *" error={errors.name} className="sm:col-span-2 xl:col-span-2">
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Nome completo do usuário" className={inputCls(!!errors.name)} />
            </Field>

            <Field label="CPF *" error={errors.cpf}>
              <input value={cpf} onChange={e => setCpf(maskCpf(e.target.value))}
                placeholder="000.000.000-00" className={inputCls(!!errors.cpf)} />
            </Field>

            <Field label="E-mail *" error={errors.email}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@prefeitura.gov.br" className={inputCls(!!errors.email)} />
            </Field>

            <Field label="WhatsApp">
              <input value={whatsapp} onChange={e => setWhatsapp(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000" className={inputCls(false)} />
            </Field>
          </div>
        </div>
      </FormSection>

      {/* ── Seção 2: Endereço ─────────────────────────────────────────────── */}
      <FormSection title="Endereço" subtitle="Localização residencial do usuário">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-4">
          <Field label="CEP">
            <input value={cep} onChange={e => setCep(maskCep(e.target.value))}
              placeholder="00000-000" className={inputCls(false)} />
          </Field>

          <Field label="Logradouro" className="xl:col-span-2">
            <input value={street} onChange={e => setStreet(e.target.value)}
              placeholder="Rua, Avenida, Travessa..." className={inputCls(false)} />
          </Field>

          <Field label="Número">
            <input value={number} onChange={e => setNumber(e.target.value)}
              placeholder="Ex: 123" className={inputCls(false)} />
          </Field>

          <Field label="Complemento">
            <input value={complement} onChange={e => setComplement(e.target.value)}
              placeholder="Apto, Bloco, Sala..." className={inputCls(false)} />
          </Field>

          <Field label="Bairro">
            <input value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              placeholder="Nome do bairro" className={inputCls(false)} />
          </Field>

          <Field label="Cidade">
            <input value={city} onChange={e => setCity(e.target.value)}
              placeholder="Nome da cidade" className={inputCls(false)} />
          </Field>

          <Field label="Estado">
            <select value={addrState} onChange={e => setAddrState(e.target.value)} className={inputCls(false)}>
              <option value="">UF</option>
              {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </FormSection>

      {/* ── Seção 3: Senha de acesso ───────────────────────────────────────── */}
      <FormSection
        title="Senha de acesso"
        subtitle={isEdit
          ? 'Deixe em branco para manter a senha atual. O login é feito por CPF ou e-mail.'
          : 'O usuário poderá alterar a senha no primeiro acesso. O login é feito por CPF ou e-mail.'
        }
      >
        <div className="space-y-4">

          {/* Campo de senha */}
          <Field label={isEdit ? 'Nova senha' : 'Senha provisória *'} error={errors.password}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Digite ou gere uma senha"
                  className={cn(inputCls(!!errors.password), 'pr-10 font-mono')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap"
                title="Gerar senha aleatória"
              >
                <RefreshCw size={13} />
                Gerar senha
              </button>
            </div>
          </Field>

          {/* Regras de segurança */}
          {password && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
              {([
                { key: 'length',  label: 'Mín. 8 caracteres' },
                { key: 'upper',   label: 'Letra maiúscula'   },
                { key: 'lower',   label: 'Letra minúscula'   },
                { key: 'digit',   label: 'Número'            },
                { key: 'special', label: 'Caractere especial' },
              ] as const).map(rule => {
                const ok = pwdRules[rule.key]
                return (
                  <div key={rule.key} className={cn(
                    'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs border transition-colors',
                    ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400',
                  )}>
                    {ok
                      ? <Check size={12} className="shrink-0" />
                      : <X size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
                    }
                    {rule.label}
                  </div>
                )
              })}
            </div>
          )}

          {/* Aviso */}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Ao gerar, a senha ficará visível automaticamente. Compartilhe-a com o usuário antes de salvar.
          </p>
        </div>
      </FormSection>

      {/* ── Seção 4: Acessos ──────────────────────────────────────────────── */}
      <FormSection
        title="Acessos por município"
        subtitle="Defina em quais unidades o usuário terá acesso e com qual perfil"
        action={
          <button type="button" onClick={addMunicipality}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors">
            <Plus size={13} />
            Adicionar município
          </button>
        }
      >
        <div className="space-y-4">
          {accesses.map((mun, mi) => {
            const availableFacilities = mockFacilities.filter(f => f.municipalityId === mun.municipalityId)
            const selectedFacIds      = mun.facilities.map(f => f.facilityId)

            return (
              <div key={mi} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">

                {/* Cabeçalho município */}
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                  <button type="button" onClick={() => toggleMunicipality(mi)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0">
                    {mun.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <select value={mun.municipalityId} onChange={e => setMunicipality(mi, e.target.value)}
                      className={cn('w-full bg-transparent text-sm font-semibold outline-none',
                        mun.municipalityId ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500')}>
                      <option value="">Selecione o município...</option>
                      {mockMunicipalities.map(m => (
                        <option key={m.id} value={m.id}>{m.name} – {m.state}</option>
                      ))}
                    </select>
                    {errors[`mun-${mi}`] && <p className="text-[11px] text-red-500 mt-0.5">{errors[`mun-${mi}`]}</p>}
                  </div>
                  {accesses.length > 1 && (
                    <button type="button" onClick={() => removeMunicipality(mi)}
                      className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Unidades */}
                {mun.expanded && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {mun.facilities.map((fac, fi) => (
                      <div key={fi} className="px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-start">
                          <Field label="Unidade" error={errors[`fac-${mi}-${fi}`]}>
                            <select value={fac.facilityId}
                              onChange={e => setFacilityField(mi, fi, 'facilityId', e.target.value)}
                              disabled={!mun.municipalityId} className={inputCls(!!errors[`fac-${mi}-${fi}`])}>
                              <option value="">Selecione...</option>
                              {availableFacilities
                                .filter(f => !selectedFacIds.includes(f.id) || f.id === fac.facilityId)
                                .map(f => <option key={f.id} value={f.id}>{f.shortName}</option>)}
                            </select>
                          </Field>
                          <Field label="Cargo / Perfil" error={errors[`role-${mi}-${fi}`]}>
                            <select value={fac.role}
                              onChange={e => setFacilityField(mi, fi, 'role', e.target.value)}
                              className={inputCls(!!errors[`role-${mi}-${fi}`])}>
                              <option value="">Selecione...</option>
                              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </Field>
                          <div className="flex items-end pb-0.5">
                            {mun.facilities.length > 1
                              ? <button type="button" onClick={() => removeFacility(mi, fi)}
                                  className="p-2 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              : <div className="w-9" />
                            }
                          </div>
                        </div>

                        {/* Módulos */}
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                            Módulos com acesso
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {ALL_MODULES.map(mod => {
                              const active = fac.modules.includes(mod.id)
                              return (
                                <button key={mod.id} type="button" onClick={() => toggleModule(mi, fi, mod.id)}
                                  className={cn('px-3 py-1.5 rounded-md text-xs font-semibold border transition-all',
                                    active
                                      ? 'text-white border-transparent'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                  )}
                                  style={active ? { backgroundColor: mod.color } : undefined}>
                                  {mod.label}
                                </button>
                              )
                            })}
                          </div>
                          {errors[`mod-${mi}-${fi}`] && (
                            <p className="text-[11px] text-red-500 mt-1.5">{errors[`mod-${mi}-${fi}`]}</p>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="px-4 py-3">
                      <button type="button" onClick={() => addFacility(mi)}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-500 transition-colors">
                        <Plus size={13} />
                        Adicionar unidade
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </FormSection>

      {/* Ações */}
      <div className="flex items-center justify-end gap-3 pt-6 pb-6 border-t border-slate-100 dark:border-slate-800 mt-2">
        <button type="button" onClick={() => navigate(isEdit ? `/ops/usuarios/${id}` : '/ops/usuarios')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit"
          className="px-5 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-white transition-colors">
          {isEdit ? 'Salvar alterações' : 'Cadastrar usuário'}
        </button>
      </div>

    </form>

    {showPhotoModal && (
      <PhotoCropModal
        onConfirm={dataUrl => { setPhoto(dataUrl); setShowPhotoModal(false) }}
        onClose={() => setShowPhotoModal(false)}
      />
    )}
    </>
  )
}

// ── Componentes auxiliares ─────────────────────────────────────────────────────

function FormSection({
  title, subtitle, action, children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 py-8 border-t border-slate-100 dark:border-slate-800 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          {action && <div className="lg:hidden">{action}</div>}
        </div>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{subtitle}</p>}
        {action && <div className="hidden lg:block mt-3">{action}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function inputCls(hasError: boolean) {
  return cn(
    'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg outline-none transition-colors',
    'text-slate-800 dark:text-slate-200 placeholder-slate-400',
    hasError
      ? 'border-red-400 focus:border-red-500'
      : 'border-slate-200 dark:border-slate-700 focus:border-sky-400'
  )
}

function Field({
  label, error, children, className,
}: {
  label: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
