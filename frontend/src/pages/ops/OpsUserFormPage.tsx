import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp,
  Eye, EyeOff, RefreshCw, Check, X,
} from 'lucide-react'
import { userApi, type UserDetail, type UserStatus, type UserLevel } from '../../api/users'
import { useAuthStore } from '../../store/authStore'
import { directoryApi, type MunicipalityDto, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
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

const STATUSES: UserStatus[] = ['Ativo', 'Inativo', 'Bloqueado']
const LEVELS: UserLevel[] = ['master', 'admin', 'user']

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
  const required = [pick(CHARSET.upper), pick(CHARSET.lower), pick(CHARSET.digit), pick(CHARSET.special)]
  const rest = Array.from({ length: length - required.length }, () => pick(all))
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('')
}

function checkPassword(pwd: string) {
  return {
    length:  pwd.length >= 8,
    upper:   /[A-Z]/.test(pwd),
    lower:   /[a-z]/.test(pwd),
    digit:   /[0-9]/.test(pwd),
    special: /[!@#$%&*]/.test(pwd),
  }
}

// ── Tipos internos ────────────────────────────────────────────────────────────

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

const emptyFacility     = (): FacilityAccess     => ({ facilityId: '', role: '', modules: [] })
const emptyMunicipality = (): MunicipalityAccess => ({ municipalityId: '', expanded: true, facilities: [emptyFacility()] })

function detailToAccesses(
  detail: UserDetail,
  scopeMunIds?: Set<string>,
): { accesses: MunicipalityAccess[]; outOfScope: UserDetail['municipalities'] } {
  // Se scope informado, separa o que está fora do escopo (read-only).
  // ADMIN só edita os in-scope; os out-of-scope são preservados pelo backend.
  const visible = scopeMunIds
    ? detail.municipalities.filter(m => scopeMunIds.has(m.municipalityId))
    : detail.municipalities
  const outOfScope = scopeMunIds
    ? detail.municipalities.filter(m => !scopeMunIds.has(m.municipalityId))
    : []

  const accesses = visible.length === 0
    ? [emptyMunicipality()]
    : visible.map(m => ({
        municipalityId: m.municipalityId,
        expanded: true,
        facilities: m.facilities.length > 0
          ? m.facilities.map(f => ({
              facilityId: f.facilityId,
              role: f.role,
              modules: f.modules,
            }))
          : [emptyFacility()],
      }))
  return { accesses, outOfScope }
}

// ── Componente principal ──────────────────────────────────────────────────────

export function OpsUserFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  // Estado de carga
  const [loading,    setLoading]    = useState(isEdit)
  const [saving,     setSaving]     = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [existing,   setExisting]   = useState<UserDetail | null>(null)

  // Diretório (municípios/unidades)
  const [municipalities, setMunicipalities] = useState<MunicipalityDto[]>([])
  const [facilities,     setFacilities]     = useState<FacilityDto[]>([])

  // Campos
  const [login,    setLogin]    = useState('')
  const [name,     setName]     = useState('')
  const [cpf,      setCpf]      = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [role,     setRole]     = useState('')
  const [status,   setStatus]   = useState<UserStatus>('Ativo')

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [level, setLevelState] = useState<UserLevel>('user')

  const actor = useAuthStore(s => s.user)
  const isActorMaster = actor?.level === 'master'
  // Só MASTER pode escolher o nível MASTER; para outros, o select nem lista
  // essa opção (defesa em profundidade com o backend).
  const allowedLevels: UserLevel[] = isActorMaster
    ? LEVELS
    : LEVELS.filter(l => l !== 'master')

  const [accesses, setAccesses] = useState<MunicipalityAccess[]>([emptyMunicipality()])
  const [outOfScope, setOutOfScope] = useState<UserDetail['municipalities']>([])
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const pwdRules = checkPassword(password)
  const pwdValid = Object.values(pwdRules).every(Boolean)

  // Carrega diretórios + usuário (edição)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // MASTER vê tudo; ADMIN vê só seus municípios/unidades
        const scope = actor?.level === 'master' ? 'all' : 'actor'
        const [muns, facs] = await Promise.all([
          directoryApi.listMunicipalities(scope),
          directoryApi.listFacilities(undefined, scope),
        ])
        if (cancelled) return
        setMunicipalities(muns)
        setFacilities(facs)

        if (isEdit && id) {
          const detail = await userApi.get(id)
          if (cancelled) return
          setExisting(detail)
          setLogin(detail.login)
          setName(detail.name)
          setCpf(detail.cpf)
          setEmail(detail.email)
          setPhone(detail.phone)
          setRole(detail.primaryRole)
          setStatus(detail.status)
          setLevelState(detail.level)
          // ADMIN só edita municípios do seu escopo; MASTER vê tudo.
          const scopeSet = actor?.level === 'master'
            ? undefined
            : new Set(muns.map(m => m.id))
          const { accesses, outOfScope } = detailToAccesses(detail, scopeSet)
          setAccesses(accesses)
          setOutOfScope(outOfScope)
        }
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : 'Não foi possível carregar os dados.'
        if (cancelled) return
        setGlobalError(msg)
        toast.error('Falha ao carregar dados do formulário', msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id, isEdit])

  // Login auto-sugerido a partir do nome (só no modo create, antes do toque)
  const [loginTouched, setLoginTouched] = useState(false)
  useEffect(() => {
    if (isEdit || loginTouched) return
    const slug = name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
      .split(/\s+/).filter(Boolean)
    if (slug.length >= 2) setLogin(`${slug[0]}.${slug[slug.length - 1]}`)
    else if (slug.length === 1) setLogin(slug[0])
  }, [name, isEdit, loginTouched])

  // Helpers acessos
  const addMunicipality    = () => setAccesses(a => [...a, emptyMunicipality()])
  const removeMunicipality = (mi: number) => setAccesses(a => a.filter((_, i) => i !== mi))
  const toggleMunicipality = (mi: number) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, expanded: !m.expanded } : m))
  const setMunicipality    = (mi: number, mid: string) =>
    setAccesses(a => a.map((m, i) => i === mi ? { ...m, municipalityId: mid, facilities: [emptyFacility()] } : m))
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
    if (!name.trim())   e.name  = 'Campo obrigatório'
    if (!login.trim())  e.login = 'Campo obrigatório'
    else if (!/^[a-z0-9._-]+$/.test(login)) e.login = 'Use apenas letras minúsculas, números, . _ -'
    if (!cpf.trim())    e.cpf   = 'Campo obrigatório'
    if (!email.trim())  e.email = 'Campo obrigatório'
    if (!role.trim())   e.role  = 'Selecione o perfil principal'

    if (!isEdit) {
      if (!password)      e.password = 'Campo obrigatório'
      else if (!pwdValid) e.password = 'A senha não atende aos requisitos'
    }

    // Validação flexível: permite salvar sem vínculos (usuário sem acessos).
    // Mas, se município escolhido, todos os campos de unidade precisam estar ok.
    accesses.forEach((m, mi) => {
      if (!m.municipalityId) {
        // município vazio: ignora se for o único "placeholder" e nenhum outro existir
        const hasValue = m.facilities.some(f => f.facilityId || f.role || f.modules.length > 0)
        if (hasValue) e[`mun-${mi}`] = 'Selecione o município'
        return
      }
      m.facilities.forEach((f, fi) => {
        if (!f.facilityId && !f.role && f.modules.length === 0) return // placeholder
        if (!f.facilityId)     e[`fac-${mi}-${fi}`]  = 'Selecione a unidade'
        if (!f.role)           e[`role-${mi}-${fi}`] = 'Selecione o cargo'
        if (!f.modules.length) e[`mod-${mi}-${fi}`]  = 'Selecione ao menos um módulo'
      })
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildPayloadAccesses = () => {
    return accesses
      .filter(m => m.municipalityId)
      .map(m => ({
        municipalityId: m.municipalityId,
        facilities: m.facilities
          .filter(f => f.facilityId && f.role && f.modules.length > 0)
          .map(f => ({ facilityId: f.facilityId, role: f.role, modules: f.modules })),
      }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGlobalError('')
    if (!validate()) {
      toast.warning('Revise os campos', 'Existem erros no formulário.')
      return
    }

    setSaving(true)
    try {
      // Belt-and-suspenders: se ator não é MASTER, NUNCA envia 'master',
      // mesmo que o state local esteja corrompido.
      const safeLevel: UserLevel =
        isActorMaster && level ? level : 'user'

      if (isEdit && id) {
        await userApi.update(id, {
          email,
          name,
          phone,
          primaryRole: role,
          status,
          // só master pode alterar level (e nunca pra master se o ator não for master)
          level: isActorMaster ? safeLevel : undefined,
          municipalities: buildPayloadAccesses(),
        })
        toast.success('Usuário atualizado', name)
        navigate(`/ops/usuarios/${id}`, { replace: true })
      } else {
        const created = await userApi.create({
          login,
          email,
          name,
          cpf: cpf.replace(/\D/g, ''),
          phone,
          primaryRole: role,
          password,
          status,
          level: safeLevel,
          municipalities: buildPayloadAccesses(),
        })
        toast.success('Usuário criado', `${created.name} · login ${created.login}`)
        navigate(`/ops/usuarios/${created.id}`, { replace: true })
      }
    } catch (err) {
      let msg = 'Erro ao salvar.'
      if (err instanceof HttpError) {
        if (err.code === 'conflict') msg = err.message
        else if (err.status === 422) msg = 'Campos inválidos. Revise os dados.'
        else msg = err.message
      }
      setGlobalError(msg)
      toast.error(isEdit ? 'Falha ao salvar alterações' : 'Falha ao cadastrar usuário', msg)
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin w-6 h-6 text-sky-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-0">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate('/ops/usuarios')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {isEdit ? 'Editar usuário' : 'Cadastro de usuário'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEdit ? (existing?.name ?? '') : 'Preencha os dados e configure os acessos'}
          </p>
        </div>
      </div>

      {globalError && (
        <div className="mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {globalError}
        </div>
      )}

      {/* Dados pessoais */}
      <FormSection title="Dados pessoais" subtitle="Identificação e contato do usuário">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4">
          <Field label="Nome completo *" error={errors.name} className="sm:col-span-2 xl:col-span-2">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Nome completo do usuário" className={inputCls(!!errors.name)} />
          </Field>

          <Field label="Login *" error={errors.login}>
            <input
              value={login}
              onChange={e => { setLogin(e.target.value.toLowerCase()); setLoginTouched(true) }}
              disabled={isEdit}
              placeholder="login.do.usuario"
              className={cn(inputCls(!!errors.login), isEdit && 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed')}
            />
          </Field>

          <Field label="CPF *" error={errors.cpf}>
            <input value={cpf} onChange={e => setCpf(maskCpf(e.target.value))} disabled={isEdit}
              placeholder="000.000.000-00"
              className={cn(inputCls(!!errors.cpf), isEdit && 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed')} />
          </Field>

          <Field label="E-mail *" error={errors.email}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@prefeitura.gov.br" className={inputCls(!!errors.email)} />
          </Field>

          <Field label="Telefone">
            <input value={phone} onChange={e => setPhone(maskPhone(e.target.value))}
              placeholder="(00) 00000-0000" className={inputCls(false)} />
          </Field>

          <Field label="Perfil principal *" error={errors.role}>
            <select value={role} onChange={e => setRole(e.target.value)} className={inputCls(!!errors.role)}>
              <option value="">Selecione...</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Status">
            <select value={status} onChange={e => setStatus(e.target.value as UserStatus)} className={inputCls(false)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          {isActorMaster && (
            <Field label="Nível do usuário">
              <select
                value={level}
                onChange={e => setLevelState(e.target.value as UserLevel)}
                className={inputCls(false)}
              >
                {allowedLevels.map(l => (
                  <option key={l} value={l}>
                    {l === 'master' ? 'MASTER (plataforma)' : l === 'admin' ? 'ADMIN (município)' : 'USER (operacional)'}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                MASTER só pode ser atribuído por outro MASTER.
              </p>
            </Field>
          )}
        </div>
      </FormSection>

      {/* Senha (só no cadastro) */}
      {!isEdit && (
        <FormSection
          title="Senha de acesso"
          subtitle="O usuário poderá alterar a senha após o primeiro acesso."
        >
          <div className="space-y-4">
            <Field label="Senha provisória *" error={errors.password}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Digite ou gere uma senha"
                    className={cn(inputCls(!!errors.password), 'pr-10 font-mono')}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <button type="button" onClick={() => { setPassword(generatePassword()); setShowPassword(true) }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap">
                  <RefreshCw size={13} />
                  Gerar senha
                </button>
              </div>
            </Field>

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
                      {ok ? <Check size={12} /> : <X size={12} className="text-slate-300 dark:text-slate-600" />}
                      {rule.label}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </FormSection>
      )}

      {/* Acessos */}
      <FormSection
        title="Acessos por município"
        subtitle="Defina as unidades e módulos acessíveis. Pode ficar vazio para cadastrar sem acessos."
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
            const availableFacilities = mun.municipalityId
              ? facilities.filter(f => f.municipalityId === mun.municipalityId)
              : []
            const selectedFacIds = mun.facilities.map(f => f.facilityId)

            return (
              <div key={mi} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
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
                      {municipalities.map(m => (
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
                              : <div className="w-9" />}
                          </div>
                        </div>

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

          {/* Acessos fora do escopo do ADMIN (read-only) */}
          {outOfScope.length > 0 && (
            <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/60 dark:bg-slate-900/40">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Acessos fora do seu escopo de administração
              </p>
              <p className="text-xs text-slate-500 mb-3">
                Este usuário também atua nos municípios abaixo. Você não pode
                editá-los; eles serão preservados como estão.
              </p>
              <ul className="space-y-1">
                {outOfScope.map(m => (
                  <li key={m.municipalityId} className="text-xs text-slate-600 dark:text-slate-300">
                    · <span className="font-medium">{m.municipalityName}</span>{' '}
                    <span className="text-slate-400">
                      — {m.facilities.length} unidade{m.facilities.length !== 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </FormSection>

      {/* Ações */}
      <div className="flex items-center justify-end gap-3 pt-6 pb-6 border-t border-slate-100 dark:border-slate-800 mt-2">
        <button type="button" onClick={() => navigate(isEdit ? `/ops/usuarios/${id}` : '/ops/usuarios')}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-white transition-colors disabled:opacity-60">
          {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar usuário'}
        </button>
      </div>
    </form>
  )
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function FormSection({
  title, subtitle, action, children,
}: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode
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
    hasError ? 'border-red-400 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-sky-400'
  )
}

function Field({
  label, error, children, className,
}: {
  label: string; error?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
