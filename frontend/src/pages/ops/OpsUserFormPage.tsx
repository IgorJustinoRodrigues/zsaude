import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp,
  Eye, EyeOff, RefreshCw, Check, X, Shield, Info, AlertTriangle,
} from 'lucide-react'
import { userApi, type UserDetail, type UserStatus, type UserLevel } from '../../api/users'
import { rolesAdminApi, type RoleSummary } from '../../api/roles'
import { cnesAdminApi, type CnesProfessionalOption } from '../../api/cnes'
import { useAuthStore } from '../../store/authStore'
import { directoryApi, type MunicipalityDto, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { UserPhotoField } from './components/UserPhotoField'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'

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

// CNS: 15 dígitos exibidos como "000 0000 0000 0000".
function maskCns(v: string) {
  return v.replace(/\D/g, '').slice(0, 15)
    .replace(/(\d{3})(\d)/, '$1 $2')
    .replace(/(\d{3} \d{4})(\d)/, '$1 $2')
    .replace(/(\d{3} \d{4} \d{4})(\d)/, '$1 $2')
}

// Extrai "campo: mensagem" dos erros Pydantic do backend (FastAPI 422).
// Ex.: [{ loc: "('body','email')", msg: "value is not a valid email" }, ...]
function describeValidationErrors(errors: unknown): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Campos inválidos. Revise os dados.'
  }
  const parts: string[] = []
  for (const e of errors) {
    if (!e || typeof e !== 'object') continue
    const raw = (e as { loc?: unknown; msg?: unknown }).loc
    const msg = (e as { msg?: unknown }).msg
    // `loc` pode vir como string "('body', 'email')" ou array ['body','email'].
    let path = ''
    if (Array.isArray(raw)) {
      path = raw.filter(s => s !== 'body').map(String).join('.')
    } else if (typeof raw === 'string') {
      path = raw.replace(/[()']/g, '').split(',').map(s => s.trim())
        .filter(s => s && s !== 'body').join('.')
    }
    const label = path || 'campo'
    parts.push(`${label}: ${msg ?? 'inválido'}`)
    if (parts.length >= 3) break
  }
  return parts.length
    ? `Campos inválidos — ${parts.join(' · ')}`
    : 'Campos inválidos. Revise os dados.'
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

interface CnesBindingDraft {
  cboId: string
  cboDescription: string | null
  cnesProfessionalId: string
  cnesSnapshotCpf: string | null
  cnesSnapshotNome: string | null
  /** ``null`` = herda do acesso pai. */
  roleId: string | null
}

interface FacilityAccess {
  facilityId: string
  roleId: string
  /** Lista de vínculos CNES atribuídos a esse acesso. */
  cnesBindings: CnesBindingDraft[]
}

interface MunicipalityAccess {
  municipalityId: string
  expanded: boolean
  facilities: FacilityAccess[]
}

const emptyFacility = (): FacilityAccess => ({
  facilityId: '', roleId: '',
  cnesBindings: [],
})
const emptyMunicipality = (): MunicipalityAccess => ({ municipalityId: '', expanded: true, facilities: [emptyFacility()] })

function detailToAccesses(
  detail: UserDetail,
  scopeMunIds?: Set<string>,
): { accesses: MunicipalityAccess[]; outOfScope: UserDetail['municipalities'] } {
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
              roleId: f.roleId,
              cnesBindings: (f.cnesBindings ?? []).map(b => ({
                cboId: b.cboId,
                cboDescription: b.cboDescription,
                cnesProfessionalId: b.cnesProfessionalId,
                cnesSnapshotCpf: b.cnesSnapshotCpf,
                cnesSnapshotNome: b.cnesSnapshotNome,
                roleId: b.roleId,
              })),
            }))
          : [emptyFacility()],
      }))
  return { accesses, outOfScope }
}

// ── Componente principal ──────────────────────────────────────────────────────

export function OpsUserFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { pathname } = useLocation()
  // MASTER acessa via /sys/usuarios; demais via /ops/usuarios. Preserva
  // o prefixo nas navegações de volta pra não cair fora do shell.
  const base = pathname.startsWith('/sys/') ? '/sys/usuarios' : '/ops/usuarios'
  const isEdit = !!id

  // Estado de carga
  const [loading,    setLoading]    = useState(isEdit)
  const [saving,     setSaving]     = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [existing,   setExisting]   = useState<UserDetail | null>(null)

  // Diretório (municípios/unidades)
  const [municipalities, setMunicipalities] = useState<MunicipalityDto[]>([])
  const [facilities,     setFacilities]     = useState<FacilityDto[]>([])
  const [allRoles,       setAllRoles]       = useState<RoleSummary[]>([])

  // Campos
  const [name,     setName]     = useState('')
  const [cpf,      setCpf]      = useState('')
  const [cns,      setCns]      = useState('')
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
        const [muns, facs, roles] = await Promise.all([
          directoryApi.listMunicipalities(scope),
          directoryApi.listFacilities(undefined, scope),
          rolesAdminApi.list({ includeArchived: false }),
        ])
        if (cancelled) return
        setMunicipalities(muns)
        setFacilities(facs)
        setAllRoles(roles)

        if (isEdit && id) {
          const detail = await userApi.get(id)
          if (cancelled) return
          setExisting(detail)
          setName(detail.name ?? '')
          setCpf(detail.cpf ? maskCpf(detail.cpf) : '')
          setCns(detail.cns ? maskCns(detail.cns) : '')
          setEmail(detail.email ?? '')
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

  // Helpers acessos
  const addMunicipality    = () => setAccesses(a => [...a, emptyMunicipality()])
  const removeMunicipality = (mi: number) => setAccesses(a => a.filter((_, i) => i !== mi))
  const toggleMunicipality = (mi: number) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, expanded: !m.expanded } : m))
  const setMunicipality    = (mi: number, mid: string) =>
    setAccesses(a => a.map((m, i) => i === mi ? { ...m, municipalityId: mid, facilities: [emptyFacility()] } : m))
  const addFacility        = (mi: number) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, facilities: [...m.facilities, emptyFacility()] } : m))
  const removeFacility     = (mi: number, fi: number) => setAccesses(a => a.map((m, i) => i === mi ? { ...m, facilities: m.facilities.filter((_, j) => j !== fi) } : m))

  const setFacilityField = (mi: number, fi: number, field: 'facilityId' | 'roleId', value: string) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? {
          ...m,
          facilities: m.facilities.map((f, j) => {
            if (j !== fi) return f
            const next: FacilityAccess = { ...f, [field]: value }
            // Trocar de unidade invalida os vínculos CNES anteriores.
            if (field === 'facilityId') next.cnesBindings = []
            return next
          }),
        }
      : m
    ))

  const addCnesBinding = (mi: number, fi: number, binding: CnesBindingDraft) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? {
          ...m,
          facilities: m.facilities.map((f, j) => {
            if (j !== fi) return f
            // Deduplica por (profissional, cbo) — impede dois bindings iguais.
            const exists = f.cnesBindings.some(b =>
              b.cnesProfessionalId === binding.cnesProfessionalId && b.cboId === binding.cboId,
            )
            if (exists) return f
            return { ...f, cnesBindings: [...f.cnesBindings, binding] }
          }),
        }
      : m
    ))

  const removeCnesBinding = (mi: number, fi: number, bi: number) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? {
          ...m,
          facilities: m.facilities.map((f, j) => j === fi
            ? { ...f, cnesBindings: f.cnesBindings.filter((_, k) => k !== bi) }
            : f),
        }
      : m
    ))

  const setCnesBindingRole = (mi: number, fi: number, bi: number, roleId: string | null) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? {
          ...m,
          facilities: m.facilities.map((f, j) => j === fi
            ? {
                ...f,
                cnesBindings: f.cnesBindings.map((b, k) =>
                  k === bi ? { ...b, roleId } : b,
                ),
              }
            : f),
        }
      : m
    ))

  // Roles disponíveis para um município: SYSTEM ∪ MUNICIPALITY do próprio.
  const rolesForMunicipality = (munId: string): RoleSummary[] => {
    return allRoles.filter(r =>
      r.scope === 'SYSTEM' || r.municipalityId === munId,
    )
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim())   e.name  = 'Campo obrigatório'
    // CPF e e-mail são opcionais individualmente, mas **pelo menos um** é obrigatório.
    if (!cpf.trim() && !email.trim()) {
      e.identifier = 'Informe CPF ou e-mail.'
    } else {
      if (cpf.trim()) {
        const digits = cpf.replace(/\D/g, '')
        if (digits.length !== 11) e.cpf = 'CPF deve ter 11 dígitos.'
      }
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        e.email = 'E-mail inválido.'
      }
    }
    // CNS: 15 dígitos; só valida se informado.
    if (cns.trim()) {
      const cnsDigits = cns.replace(/\D/g, '')
      if (cnsDigits.length !== 15) e.cns = 'CNS deve ter 15 dígitos.'
    }
    if (!role.trim())   e.role  = 'Selecione o perfil principal'

    if (!isEdit) {
      if (!password)      e.password = 'Campo obrigatório'
      else if (!pwdValid) e.password = 'A senha não atende aos requisitos'
    }

    // MASTER não tem vínculos operacionais — pula validação de acessos.
    // ADMIN exige só município (sem unidade/perfil operacional).
    // USER exige o triplo município + unidade + perfil.
    if (level === 'admin') {
      const seen = new Set<string>()
      accesses.forEach((m, mi) => {
        if (!m.municipalityId) return
        if (seen.has(m.municipalityId)) e[`mun-${mi}`] = 'Município já selecionado'
        seen.add(m.municipalityId)
      })
    } else if (level === 'user') {
      accesses.forEach((m, mi) => {
        if (!m.municipalityId) {
          const hasValue = m.facilities.some(f => f.facilityId || f.roleId)
          if (hasValue) e[`mun-${mi}`] = 'Selecione o município'
          return
        }
        m.facilities.forEach((f, fi) => {
          if (!f.facilityId && !f.roleId) return // placeholder
          if (!f.facilityId) e[`fac-${mi}-${fi}`]  = 'Selecione a unidade'
          if (!f.roleId)     e[`role-${mi}-${fi}`] = 'Selecione o perfil'
        })
      })
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildPayloadAccesses = () => {
    // MASTER: sem vínculos operacionais — enxerga tudo.
    if (level === 'master') return []
    // ADMIN: só vínculo de município (sem unidade/perfil operacional).
    if (level === 'admin') {
      const uniqueMunIds = Array.from(
        new Set(accesses.filter(m => m.municipalityId).map(m => m.municipalityId)),
      )
      return uniqueMunIds.map(id => ({ municipalityId: id, facilities: [] }))
    }
    // USER: município + unidades com perfil operacional.
    return accesses
      .filter(m => m.municipalityId)
      .map(m => ({
        municipalityId: m.municipalityId,
        facilities: m.facilities
          .filter(f => f.facilityId && f.roleId)
          .map(f => ({
            facilityId: f.facilityId,
            roleId: f.roleId,
            cnesBindings: f.cnesBindings.map(b => ({
              cboId: b.cboId,
              cboDescription: b.cboDescription,
              cnesProfessionalId: b.cnesProfessionalId,
              cnesSnapshotCpf: b.cnesSnapshotCpf,
              cnesSnapshotNome: b.cnesSnapshotNome,
              roleId: b.roleId,
            })),
          })),
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
        const cnsDigits = cns.replace(/\D/g, '')
        const cpfDigits = cpf.replace(/\D/g, '')
        // Só MASTER pode alterar CPF; ADMIN manda ``undefined`` (não enviado).
        // Quando o valor atual bate com o do usuário, também omite pra não
        // poluir o diff / não gerar audit desnecessário.
        const existingCpf = existing?.cpf ?? ''
        const cpfChanged = cpfDigits !== existingCpf
        await userApi.update(id, {
          // EmailStr rejeita ""; quando o campo está vazio, não enviar.
          email: email.trim() || undefined,
          name,
          cpf: isActorMaster && cpfChanged ? (cpfDigits || null) : undefined,
          // ``null`` explícito = limpar CNS; omitido quando não for USER/ADMIN.
          cns: level === 'master' ? undefined : (cnsDigits || null),
          phone,
          primaryRole: role,
          status,
          // só master pode alterar level (e nunca pra master se o ator não for master)
          level: isActorMaster ? safeLevel : undefined,
          municipalities: buildPayloadAccesses(),
        })
        toast.success('Usuário atualizado', name)
        navigate(`${base}/${id}`, { replace: true })
      } else {
        const cpfDigits = cpf.replace(/\D/g, '')
        const cnsDigits = cns.replace(/\D/g, '')
        const created = await userApi.create({
          email: email.trim() || undefined,
          name,
          cpf: cpfDigits || undefined,
          // CNS só faz sentido pra USER/ADMIN.
          cns: safeLevel === 'master' ? undefined : (cnsDigits || undefined),
          phone,
          primaryRole: role,
          password,
          status,
          level: safeLevel,
          municipalities: buildPayloadAccesses(),
        })
        toast.success('Usuário criado', created.name)
        navigate(`${base}/${created.id}`, { replace: true })
      }
    } catch (err) {
      let msg = 'Erro ao salvar.'
      if (err instanceof HttpError) {
        if (err.code === 'conflict') msg = err.message
        else if (err.status === 422) msg = describeValidationErrors(err.errors)
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
        <button type="button" onClick={() => navigate(base)}
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

      {/* Foto (apenas em edição — precisamos do id do usuário) */}
      {isEdit && id && (
        <FormSection
          title="Foto do usuário"
          subtitle="Imagem exibida no sistema e usada para reconhecimento facial."
        >
          <UserPhotoField userId={id} userName={existing?.name || name || 'usuário'} />
        </FormSection>
      )}

      {/* Dados pessoais */}
      <FormSection title="Dados pessoais" subtitle="Identificação e contato do usuário">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4">
          <Field label="Nome completo *" error={errors.name} className="sm:col-span-2 xl:col-span-3">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Nome completo do usuário" className={inputCls(!!errors.name)} />
          </Field>

          <Field
            label="CPF"
            error={errors.cpf || errors.identifier}
            hint={
              isEdit && !isActorMaster
                ? 'CPF só pode ser alterado por MASTER.'
                : 'Usado para entrar no sistema. CPF ou e-mail é obrigatório — pelo menos um.'
            }
          >
            <input value={cpf} onChange={e => setCpf(maskCpf(e.target.value))}
              disabled={isEdit && !isActorMaster}
              placeholder="000.000.000-00"
              className={cn(
                inputCls(!!(errors.cpf || errors.identifier)),
                isEdit && !isActorMaster && 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed',
              )} />
          </Field>

          <Field
            label="E-mail"
            error={errors.email || (errors.identifier && !errors.cpf ? errors.identifier : undefined)}
            hint="Usado para entrar no sistema. CPF ou e-mail é obrigatório — pelo menos um."
          >
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@prefeitura.gov.br"
              className={inputCls(!!(errors.email || errors.identifier))} />
          </Field>

          <Field label="Telefone">
            <input value={phone} onChange={e => setPhone(maskPhone(e.target.value))}
              placeholder="(00) 00000-0000" className={inputCls(false)} />
          </Field>

          {level !== 'master' && (
            <Field
              label="CNS"
              error={errors.cns}
              hint="Cartão Nacional de Saúde — opcional. 15 dígitos."
            >
              <input value={cns} onChange={e => setCns(maskCns(e.target.value))}
                placeholder="000 0000 0000 0000"
                className={inputCls(!!errors.cns)} />
            </Field>
          )}

          <Field
            label="Cargo / função principal *"
            error={errors.role}
            hint="Descrição livre — serve como rótulo do usuário (ex.: 'Médica', 'Enfermeira'). As permissões vêm do perfil configurado em cada acesso."
          >
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Ex: Recepcionista"
              className={inputCls(!!errors.role)}
            />
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

      {/* Acessos — varia por nível:
          · MASTER: sem vínculos (enxerga tudo).
          · ADMIN:  só lista de municípios administrados.
          · USER:   município + unidade + perfil operacional. */}
      {level === 'master' ? (
        <FormSection
          title="Acesso à plataforma"
          subtitle="Usuário MASTER administra a plataforma inteira."
        >
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/30">
            <Shield size={15} className="text-violet-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              MASTER enxerga todos os municípios, unidades e módulos sem
              restrição. Não é necessário (nem recomendado) vincular a unidades
              ou perfis operacionais — as permissões são implícitas ao nível.
            </p>
          </div>
        </FormSection>
      ) : level === 'admin' ? (
        (() => {
          const selectedMunIds = accesses.map(m => m.municipalityId).filter(Boolean)
          const allPicked = selectedMunIds.length >= municipalities.length
          return (
        <FormSection
          title="Municípios administrados"
          subtitle="Municípios que este administrador pode gerenciar. Permissões operacionais não se aplicam ao nível ADMIN."
          action={
            <button type="button" onClick={addMunicipality} disabled={allPicked}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus size={13} />
              Adicionar município
            </button>
          }
        >
          <div className="space-y-2">
            {accesses.map((mun, mi) => (
              <div key={mi} className="flex items-center gap-3 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/40 dark:bg-slate-800/30">
                <div className="flex-1 min-w-0">
                  <ComboBox
                    value={mun.municipalityId || null}
                    onChange={val => setMunicipality(mi, val ?? '')}
                    invalid={!!errors[`mun-${mi}`]}
                    placeholder="Selecione o município..."
                    options={municipalities
                      .filter(m => !selectedMunIds.includes(m.id) || m.id === mun.municipalityId)
                      .map<ComboBoxOption>(m => ({ value: m.id, label: m.name, hint: m.state }))}
                  />
                  {errors[`mun-${mi}`] && <p className="text-[11px] text-red-500 mt-1">{errors[`mun-${mi}`]}</p>}
                </div>
                {accesses.length > 1 && (
                  <button type="button" onClick={() => removeMunicipality(mi)}
                    className="p-2 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            <div className="flex items-start gap-2 text-[11px] text-slate-500 px-1 pt-1">
              <Info size={12} className="mt-0.5 shrink-0" />
              <p>
                Pode ficar vazio — um ADMIN sem municípios não consegue
                gerenciar ninguém até ser vinculado.
              </p>
            </div>

            {outOfScope.length > 0 && (
              <div className="mt-4 p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/60 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Municípios fora do seu escopo
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  Este usuário também administra os municípios abaixo. Você não
                  pode editá-los; eles serão preservados como estão.
                </p>
                <ul className="space-y-1">
                  {outOfScope.map(m => (
                    <li key={m.municipalityId} className="text-xs text-slate-600 dark:text-slate-300">
                      · <span className="font-medium">{m.municipalityName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </FormSection>
          )
        })()
      ) : (
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
                    <ComboBox
                      value={mun.municipalityId || null}
                      onChange={val => setMunicipality(mi, val ?? '')}
                      invalid={!!errors[`mun-${mi}`]}
                      placeholder="Selecione o município..."
                      portal
                      options={municipalities
                        .filter(m =>
                          !accesses.some((a, ai) => ai !== mi && a.municipalityId === m.id)
                          || m.id === mun.municipalityId,
                        )
                        .map<ComboBoxOption>(m => ({ value: m.id, label: m.name, hint: m.state }))}
                    />
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
                            <ComboBox
                              value={fac.facilityId || null}
                              onChange={val => setFacilityField(mi, fi, 'facilityId', val ?? '')}
                              disabled={!mun.municipalityId}
                              invalid={!!errors[`fac-${mi}-${fi}`]}
                              placeholder="Selecione..."
                              portal
                              options={availableFacilities
                                .filter(f => !selectedFacIds.includes(f.id) || f.id === fac.facilityId)
                                .map<ComboBoxOption>(f => ({ value: f.id, label: f.shortName }))}
                            />
                          </Field>
                          <Field label="Perfil" error={errors[`role-${mi}-${fi}`]}>
                            <ComboBox
                              value={fac.roleId || null}
                              onChange={val => setFacilityField(mi, fi, 'roleId', val ?? '')}
                              disabled={!mun.municipalityId}
                              invalid={!!errors[`role-${mi}-${fi}`]}
                              placeholder="Selecione..."
                              portal
                              options={rolesForMunicipality(mun.municipalityId)
                                .map<ComboBoxOption>(r => ({ value: r.id, label: r.name }))}
                            />
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

                        {/* Vínculos CNES (0..N) — lista + busca pra adicionar */}
                        {fac.facilityId && mun.municipalityId && (
                          <div className="mt-3">
                            <CnesBindingsList
                              municipalityId={mun.municipalityId}
                              facilityId={fac.facilityId}
                              userCpfDigits={cpf.replace(/\D/g, '')}
                              bindings={fac.cnesBindings}
                              availableRoles={rolesForMunicipality(mun.municipalityId)}
                              onAdd={b => addCnesBinding(mi, fi, b)}
                              onRemove={bi => removeCnesBinding(mi, fi, bi)}
                              onChangeRole={(bi, roleId) =>
                                setCnesBindingRole(mi, fi, bi, roleId)
                              }
                            />
                          </div>
                        )}

                        <p className="text-[11px] text-muted-foreground mt-2">
                          Módulos e permissões são derivados do perfil selecionado.
                          Você poderá ajustar permissões específicas deste acesso depois.
                        </p>
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
      )}

      {/* Ações */}
      <div className="flex items-center justify-end gap-3 pt-6 pb-6 border-t border-slate-100 dark:border-slate-800 mt-2">
        <button type="button" onClick={() => navigate(isEdit ? `${base}/${id}` : base)}
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
  label, error, hint, children, className,
}: {
  label: string; error?: string; hint?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {error
        ? <p className="text-[11px] text-red-500">{error}</p>
        : hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  )
}

// ── Vínculos CNES (CBO) — lista 0..N ────────────────────────────────────────

function CnesBindingsList({
  municipalityId, facilityId, userCpfDigits, bindings, availableRoles,
  onAdd, onRemove, onChangeRole,
}: {
  municipalityId: string
  facilityId: string
  userCpfDigits: string
  bindings: CnesBindingDraft[]
  availableRoles: RoleSummary[]
  onAdd: (binding: CnesBindingDraft) => void
  onRemove: (index: number) => void
  onChangeRole: (index: number, roleId: string | null) => void
}) {
  const [imported, setImported] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    setChecking(true)
    setImported(null)
    cnesAdminApi.importStatus(municipalityId)
      .then(r => { if (!cancelled) setImported(r.imported) })
      .catch(() => { if (!cancelled) setImported(false) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [municipalityId])

  if (checking) {
    return <div className="text-[11px] text-slate-400">Verificando CNES do município...</div>
  }
  if (imported === false) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-300">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>
          CNES ainda não importado para este município — não é possível
          vincular CBO ao acesso. Peça ao responsável para importar em{' '}
          <span className="font-mono">Importações → CNES</span>.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Vínculos CNES (opcional)
      </p>

      {bindings.length === 0 && !adding && (
        <p className="text-[11px] text-slate-400 italic">
          Nenhum profissional vinculado a esse acesso.
        </p>
      )}

      {bindings.map((b, idx) => {
        const mismatch = userCpfDigits.length === 11
          && b.cnesSnapshotCpf
          && b.cnesSnapshotCpf.replace(/\D/g, '') !== userCpfDigits
        return (
          <div key={`${b.cnesProfessionalId}:${b.cboId}`}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                  {b.cnesSnapshotNome || 'Profissional'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 mr-1.5">
                    CBO {b.cboId}
                  </span>
                  {b.cboDescription || '—'}
                </p>
                {b.cnesSnapshotCpf && (
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    CPF {maskCpfDisplay(b.cnesSnapshotCpf)}
                  </p>
                )}
                {mismatch && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    CPF do profissional difere do cadastro do usuário.
                  </p>
                )}
              </div>
              <button type="button" onClick={() => onRemove(idx)}
                className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                <X size={13} />
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Perfil para este vínculo
              </label>
              <ComboBox
                value={b.roleId}
                onChange={val => onChangeRole(idx, val)}
                placeholder="Herda do perfil da unidade"
                portal
                options={availableRoles.map<ComboBoxOption>(r => ({
                  value: r.id, label: r.name,
                }))}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Vazio mantém o perfil da unidade. Definido sobrescreve quando este CBO está ativo.
              </p>
            </div>
          </div>
        )
      })}

      {adding ? (
        <CnesBindingSearch
          facilityId={facilityId}
          userCpfDigits={userCpfDigits}
          excludeKeys={new Set(bindings.map(b => `${b.cnesProfessionalId}:${b.cboId}`))}
          onPick={b => { onAdd(b); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300">
          <Plus size={12} />
          Adicionar vínculo CNES
        </button>
      )}
    </div>
  )
}

function CnesBindingSearch({
  facilityId, excludeKeys, onPick, onCancel,
}: {
  facilityId: string
  userCpfDigits: string
  excludeKeys: Set<string>
  onPick: (binding: CnesBindingDraft) => void
  onCancel: () => void
}) {
  // Carrega a lista completa de profissionais da unidade (limite do
  // endpoint é 500). O ComboBox faz a busca client-side por nome, CPF,
  // CNS, CBO e descrição.
  const [options, setOptions] = useState<CnesProfessionalOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!facilityId) return
    let cancelled = false
    setLoading(true)
    setError('')
    cnesAdminApi.searchProfessionals({ facilityId, limit: 500 })
      .then(r => { if (!cancelled) setOptions(r) })
      .catch(() => { if (!cancelled) setError('Falha ao carregar profissionais.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [facilityId])

  // Cada profissional pode aparecer com múltiplos CBOs — a chave composta
  // (profissional+cbo) mantém o dropdown correto.
  const comboOptions: ComboBoxOption[] = options.map(opt => {
    const key = `${opt.cnesProfessionalId}:${opt.cboId}`
    const already = excludeKeys.has(key)
    const label = already
      ? `${opt.nome} — CBO ${opt.cboId} (já vinculado)`
      : `${opt.nome} — CBO ${opt.cboId}`
    return {
      value: key,
      label,
      hint: opt.cboDescription || undefined,
      // Pesquisa matchea por qualquer campo (ComboBox normaliza acentos).
      searchText: `${opt.cpf} ${opt.nome} ${opt.cboId} ${opt.cboDescription ?? ''}`,
    }
  })

  const handleChange = (val: string | null) => {
    if (!val) return
    const [profId, cboId] = val.split(':')
    const opt = options.find(o =>
      o.cnesProfessionalId === profId && o.cboId === cboId,
    )
    if (!opt) return
    // Ignora duplicatas — a lista marca, mas se ainda clicar, não toma nota.
    if (excludeKeys.has(val)) return
    onPick({
      cboId: opt.cboId,
      cboDescription: opt.cboDescription || `CBO ${opt.cboId}`,
      cnesProfessionalId: opt.cnesProfessionalId,
      cnesSnapshotCpf: opt.cpf,
      cnesSnapshotNome: opt.nome,
      // Começa vazio — o operador pode escolher um role específico na
      // linha do binding após adicionar.
      roleId: null,
    })
  }

  return (
    <div className="space-y-1.5 pt-1">
      <ComboBox
        value={null}
        onChange={handleChange}
        disabled={loading || !!error}
        placeholder={
          loading   ? 'Carregando profissionais…'
          : error   ? error
          : comboOptions.length === 0
            ? 'Nenhum profissional nesta unidade.'
            : 'Selecione um profissional…'
        }
        options={comboOptions}
        portal
      />
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-400">
          Busca por nome, CPF, CNS, CBO ou descrição.
        </p>
        <button type="button" onClick={onCancel}
          className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function maskCpfDisplay(digits: string): string {
  const d = (digits || '').replace(/\D/g, '').padEnd(11, '•').slice(0, 11)
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}
