import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { mockMunicipalities, mockFacilities } from '../../mock/users'
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
  'Administrador do Sistema',
  'Gestor Regional',
  'Supervisor Clínico',
  'Analista',
  'Recepcionista',
  'Médico',
  'Enfermeiro',
  'Técnico de Enfermagem',
  'Fisioterapeuta',
  'Psicólogo',
  'Assistente Social',
  'Consultor Externo',
]

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

function emptyFacilityAccess(): FacilityAccess {
  return { facilityId: '', role: '', modules: [] }
}

function emptyMunicipalityAccess(): MunicipalityAccess {
  return { municipalityId: '', expanded: true, facilities: [emptyFacilityAccess()] }
}

export function OpsUserFormPage() {
  const navigate = useNavigate()

  const [name,     setName]     = useState('')
  const [login,    setLogin]    = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [accesses, setAccesses] = useState<MunicipalityAccess[]>([emptyMunicipalityAccess()])
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  // ── Municipality helpers ──────────────────────────────────────────────────

  const addMunicipality = () =>
    setAccesses(a => [...a, emptyMunicipalityAccess()])

  const removeMunicipality = (mi: number) =>
    setAccesses(a => a.filter((_, i) => i !== mi))

  const toggleMunicipality = (mi: number) =>
    setAccesses(a => a.map((m, i) => i === mi ? { ...m, expanded: !m.expanded } : m))

  const setMunicipality = (mi: number, id: string) =>
    setAccesses(a => a.map((m, i) => i === mi ? { ...m, municipalityId: id } : m))

  // ── Facility helpers ──────────────────────────────────────────────────────

  const addFacility = (mi: number) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? { ...m, facilities: [...m.facilities, emptyFacilityAccess()] }
      : m
    ))

  const removeFacility = (mi: number, fi: number) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? { ...m, facilities: m.facilities.filter((_, j) => j !== fi) }
      : m
    ))

  const setFacilityField = (mi: number, fi: number, field: keyof FacilityAccess, value: string) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? { ...m, facilities: m.facilities.map((f, j) => j === fi ? { ...f, [field]: value } : f) }
      : m
    ))

  const toggleModule = (mi: number, fi: number, mod: SystemId) =>
    setAccesses(a => a.map((m, i) => i === mi
      ? {
          ...m,
          facilities: m.facilities.map((f, j) => j === fi
            ? { ...f, modules: f.modules.includes(mod) ? f.modules.filter(x => x !== mod) : [...f.modules, mod] }
            : f
          ),
        }
      : m
    ))

  // ── Submit ────────────────────────────────────────────────────────────────

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim())     e.name     = 'Nome obrigatório'
    if (!login.trim())    e.login    = 'Login obrigatório'
    if (!email.trim())    e.email    = 'E-mail obrigatório'
    if (!password.trim()) e.password = 'Senha obrigatória'
    accesses.forEach((m, mi) => {
      if (!m.municipalityId) e[`mun-${mi}`] = 'Selecione o município'
      m.facilities.forEach((f, fi) => {
        if (!f.facilityId) e[`fac-${mi}-${fi}`] = 'Selecione a unidade'
        if (!f.role)       e[`role-${mi}-${fi}`] = 'Selecione o cargo'
        if (!f.modules.length) e[`mod-${mi}-${fi}`] = 'Selecione ao menos um módulo'
      })
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    // Em produção: POST para a API. Por ora, apenas navega de volta.
    navigate('/ops/usuarios')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/ops/usuarios')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">Novo usuário</h1>
          <p className="text-sm text-slate-500 mt-0.5">Preencha os dados e defina os acessos</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Dados pessoais */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Dados pessoais</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome completo" error={errors.name}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Maria da Silva"
                className={inputCls(!!errors.name)}
              />
            </Field>
            <Field label="E-mail" error={errors.email}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@prefeitura.gov.br"
                className={inputCls(!!errors.email)}
              />
            </Field>
            <Field label="Login" error={errors.login}>
              <input
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="Ex: maria.silva"
                className={inputCls(!!errors.login)}
              />
            </Field>
            <Field label="Senha inicial" error={errors.password}>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className={inputCls(!!errors.password)}
              />
            </Field>
          </div>
        </section>

        {/* Acessos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Acessos por município</h2>
            <button
              type="button"
              onClick={addMunicipality}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
            >
              <Plus size={13} />
              Adicionar município
            </button>
          </div>

          {accesses.map((mun, mi) => {
            const availableFacilities = mockFacilities.filter(f => f.municipalityId === mun.municipalityId)
            const selectedFacIds = mun.facilities.map(f => f.facilityId)

            return (
              <div key={mi} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">

                {/* Municipality header */}
                <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => toggleMunicipality(mi)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {mun.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <div className="flex-1">
                    <select
                      value={mun.municipalityId}
                      onChange={e => setMunicipality(mi, e.target.value)}
                      className={cn(
                        'w-full bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 outline-none',
                        !mun.municipalityId && 'text-slate-400 dark:text-slate-500'
                      )}
                    >
                      <option value="">Selecione o município...</option>
                      {mockMunicipalities.map(m => (
                        <option key={m.id} value={m.id}>{m.name} – {m.state}</option>
                      ))}
                    </select>
                    {errors[`mun-${mi}`] && (
                      <p className="text-[11px] text-red-500 mt-0.5">{errors[`mun-${mi}`]}</p>
                    )}
                  </div>
                  {accesses.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMunicipality(mi)}
                      className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Facilities */}
                {mun.expanded && (
                  <div className="p-4 space-y-4">
                    {mun.facilities.map((fac, fi) => (
                      <div key={fi} className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 space-y-4">

                        {/* Facility row header */}
                        <div className="flex items-start gap-3">
                          <div className="flex-1 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <Field label="Unidade" error={errors[`fac-${mi}-${fi}`]}>
                                <select
                                  value={fac.facilityId}
                                  onChange={e => setFacilityField(mi, fi, 'facilityId', e.target.value)}
                                  disabled={!mun.municipalityId}
                                  className={inputCls(!!errors[`fac-${mi}-${fi}`])}
                                >
                                  <option value="">Selecione...</option>
                                  {availableFacilities
                                    .filter(f => !selectedFacIds.includes(f.id) || f.id === fac.facilityId)
                                    .map(f => (
                                      <option key={f.id} value={f.id}>{f.shortName}</option>
                                    ))
                                  }
                                </select>
                              </Field>
                              <Field label="Cargo / Perfil" error={errors[`role-${mi}-${fi}`]}>
                                <select
                                  value={fac.role}
                                  onChange={e => setFacilityField(mi, fi, 'role', e.target.value)}
                                  className={inputCls(!!errors[`role-${mi}-${fi}`])}
                                >
                                  <option value="">Selecione...</option>
                                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              </Field>
                            </div>

                            {/* Módulos */}
                            <div>
                              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                                Módulos com acesso
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {ALL_MODULES.map(mod => {
                                  const active = fac.modules.includes(mod.id)
                                  return (
                                    <button
                                      key={mod.id}
                                      type="button"
                                      onClick={() => toggleModule(mi, fi, mod.id)}
                                      className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                                        active
                                          ? 'border-transparent text-white'
                                          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300',
                                      )}
                                      style={active ? { backgroundColor: mod.color, borderColor: mod.color } : undefined}
                                    >
                                      {mod.label}
                                    </button>
                                  )
                                })}
                              </div>
                              {errors[`mod-${mi}-${fi}`] && (
                                <p className="text-[11px] text-red-500 mt-1">{errors[`mod-${mi}-${fi}`]}</p>
                              )}
                            </div>
                          </div>

                          {mun.facilities.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFacility(mi, fi)}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors mt-5"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addFacility(mi)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-400 hover:text-sky-500 hover:border-sky-300 dark:hover:border-sky-700 transition-colors"
                    >
                      <Plus size={13} />
                      Adicionar unidade
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate('/ops/usuarios')}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors"
          >
            Cadastrar usuário
          </button>
        </div>

      </form>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
  return cn(
    'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border rounded-lg outline-none transition-colors',
    'text-slate-800 dark:text-slate-200 placeholder-slate-400',
    hasError
      ? 'border-red-400 focus:border-red-500'
      : 'border-slate-200 dark:border-slate-700 focus:border-sky-400'
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
