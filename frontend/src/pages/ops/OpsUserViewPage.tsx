import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, User, Mail, Phone, MapPin, Building2, Shield, Activity, LogIn, LogOut, Eye as EyeIcon, EyeOff, FilePlus, FileEdit, Trash2, Download, Printer, KeyRound, ShieldAlert, RefreshCw, Check, X } from 'lucide-react'
import { mockUsers, mockMunicipalities, mockFacilities, mockActivityLogs, type ActivityLog, type LogAction } from '../../mock/users'
import { initials, cn } from '../../lib/utils'
import type { SystemId } from '../../types'

// ─── Gerador de senha ─────────────────────────────────────────────────────────

const CHARSET = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digit: '0123456789', special: '!@#$%&*' }

function generatePassword(length = 12): string {
  const all  = CHARSET.upper + CHARSET.lower + CHARSET.digit + CHARSET.special
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  const req  = [pick(CHARSET.upper), pick(CHARSET.lower), pick(CHARSET.digit), pick(CHARSET.special)]
  const rest = Array.from({ length: length - req.length }, () => pick(all))
  return [...req, ...rest].sort(() => Math.random() - 0.5).join('')
}

function checkRules(pwd: string) {
  return {
    length:  pwd.length >= 8,
    upper:   /[A-Z]/.test(pwd),
    lower:   /[a-z]/.test(pwd),
    digit:   /[0-9]/.test(pwd),
    special: /[!@#$%&*]/.test(pwd),
  }
}

// ─── Modal de reset de senha ──────────────────────────────────────────────────

function ResetPasswordModal({ userName, onClose }: { userName: string; onClose: () => void }) {
  const [password,    setPassword]    = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [confirmed,   setConfirmed]   = useState(false)

  const rules   = checkRules(password)
  const pwdValid = Object.values(rules).every(Boolean)

  const handleGenerate = () => {
    setPassword(generatePassword())
    setShowPwd(true)
  }

  const handleConfirm = () => {
    if (!password || !pwdValid) return
    setConfirmed(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <KeyRound size={14} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Redefinir senha</h2>
              <p className="text-[11px] text-slate-400">{userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {confirmed ? (
            /* Sucesso */
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <Check size={22} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Senha redefinida com sucesso</p>
                <p className="text-xs text-slate-400 mt-1">Compartilhe a nova senha com o usuário antes de fechar.</p>
              </div>
              {showPwd && (
                <div className="w-full bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 font-mono text-sm text-slate-700 dark:text-slate-200 tracking-widest border border-slate-200 dark:border-slate-700">
                  {password}
                </div>
              )}
              <button onClick={onClose} className="mt-2 px-5 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors">
                Fechar
              </button>
            </div>
          ) : (
            <>
              {/* Campo de senha */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Nova senha</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Digite ou gere uma senha"
                      className="w-full pl-3 pr-9 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 transition-colors text-slate-800 dark:text-slate-200 placeholder-slate-400 placeholder:font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPwd ? <EyeOff size={14} /> : <EyeIcon size={14} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap"
                  >
                    <RefreshCw size={12} />
                    Gerar
                  </button>
                </div>
              </div>

              {/* Regras */}
              {password && (
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { key: 'length',  label: 'Mín. 8 caracteres' },
                    { key: 'upper',   label: 'Letra maiúscula'   },
                    { key: 'lower',   label: 'Letra minúscula'   },
                    { key: 'digit',   label: 'Número'            },
                    { key: 'special', label: 'Caractere especial' },
                  ] as const).map(rule => {
                    const ok = rules[rule.key]
                    return (
                      <div key={rule.key} className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors',
                        ok
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400',
                      )}>
                        {ok
                          ? <Check size={11} className="shrink-0" />
                          : <X size={11} className="shrink-0 text-slate-300 dark:text-slate-600" />
                        }
                        {rule.label}
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                O usuário será solicitado a criar uma nova senha no próximo acesso.
              </p>

              {/* Ações */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!password || !pwdValid}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <KeyRound size={13} />
                  Redefinir senha
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const MODULE_COLOR: Record<string, string> = {
  cln: '#0ea5e9', dgn: '#8b5cf6', hsp: '#f59e0b',
  pln: '#10b981', fsc: '#f97316', ops: '#6b7280',
}
const MODULE_LABEL: Record<string, string> = {
  cln: 'Clínica', dgn: 'Diagnóstico', hsp: 'Hospitalar',
  pln: 'Planos',  fsc: 'Fiscal',      ops: 'Operações',
}
const STATUS_STYLE: Record<string, string> = {
  Ativo:    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
  Inativo:  'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
  Bloqueado:'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800',
}

export function OpsUserViewPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showResetModal, setShowResetModal] = useState(false)

  const user = mockUsers.find(u => u.id === id)

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <User size={40} className="mb-3 opacity-30" />
        <p className="text-sm">Usuário não encontrado</p>
        <button onClick={() => navigate('/ops/usuarios')} className="mt-3 text-xs text-sky-500 hover:underline">
          Voltar à lista
        </button>
      </div>
    )
  }

  return (
    <>
    <div className="space-y-0">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/ops/usuarios')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Detalhes do usuário</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Cadastrado em {new Date(user.createdAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', STATUS_STYLE[user.status])}>
            {user.status}
          </span>
          <button
            onClick={() => setShowResetModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            <KeyRound size={14} />
            <span className="hidden sm:inline">Redefinir senha</span>
          </button>
          <button
            onClick={() => navigate(`/ops/usuarios/${user.id}/editar`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors"
          >
            <Pencil size={14} />
            Editar
          </button>
        </div>
      </div>

      {/* ── Dados pessoais ─────────────────────────────────────────────────── */}
      <ViewSection title="Dados pessoais" icon={<User size={15} />}>
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Avatar */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            {user.avatar
              ? <img src={user.avatar} alt="Foto" className="w-20 h-20 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700" />
              : (
                <div className="w-20 h-20 rounded-full bg-sky-500 flex items-center justify-center text-xl font-bold text-white ring-2 ring-slate-200 dark:ring-slate-700">
                  {initials(user.name)}
                </div>
              )
            }
          </div>
          {/* Campos */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
            <ReadField label="Nome completo" value={user.name} className="sm:col-span-2" />
            <ReadField label="CPF" value={user.cpf} />
            <ReadField label="E-mail" value={user.email} icon={<Mail size={12} />} />
            <ReadField label="WhatsApp" value={user.phone || '—'} icon={<Phone size={12} />} />
          </div>
        </div>
      </ViewSection>

      {/* ── Endereço ───────────────────────────────────────────────────────── */}
      <ViewSection title="Endereço" icon={<MapPin size={15} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4">
          <ReadField label="CEP" value="—" />
          <ReadField label="Logradouro" value="—" className="xl:col-span-2" />
          <ReadField label="Número" value="—" />
          <ReadField label="Complemento" value="—" />
          <ReadField label="Bairro" value="—" />
          <ReadField label="Cidade" value="—" />
          <ReadField label="Estado" value="—" />
        </div>
      </ViewSection>

      {/* ── Logs ───────────────────────────────────────────────────────────── */}
      <LogsSection userId={user.id} />

      {/* ── Acessos ────────────────────────────────────────────────────────── */}
      <ViewSection title="Acessos por município" icon={<Building2 size={15} />}>
        <div className="space-y-4">
          {user.municipalities.map(mun => {
            const municipality = mockMunicipalities.find(m => m.id === mun.municipalityId)
            return (
              <div key={mun.municipalityId} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {/* Header município */}
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                  <Building2 size={14} className="text-slate-400 shrink-0" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {municipality?.name ?? mun.municipalityId}
                    {municipality && <span className="ml-1 font-normal text-slate-400">– {municipality.state}</span>}
                  </p>
                </div>

                {/* Unidades */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mun.facilities.map(fac => {
                    const facility = mockFacilities.find(f => f.id === fac.facilityId)
                    return (
                      <div key={fac.facilityId} className="px-4 py-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {facility?.name ?? fac.facilityId}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                              <Shield size={10} />
                              {fac.role}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {fac.modules.map((mod: SystemId) => (
                              <span
                                key={mod}
                                className="text-[10px] font-bold px-2 py-0.5 rounded"
                                style={{ backgroundColor: MODULE_COLOR[mod] + '1a', color: MODULE_COLOR[mod] }}
                              >
                                {MODULE_LABEL[mod]}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </ViewSection>

    </div>

    {showResetModal && (
      <ResetPasswordModal userName={user.name} onClose={() => setShowResetModal(false)} />
    )}
    </>
  )
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

const LOG_META: Record<LogAction, { label: string; icon: React.ReactNode; color: string }> = {
  login:             { label: 'Login',              icon: <LogIn size={12} />,      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' },
  logout:            { label: 'Logout',             icon: <LogOut size={12} />,     color: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800' },
  view:              { label: 'Visualização',        icon: <EyeIcon size={12} />,    color: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40' },
  create:            { label: 'Criação',             icon: <FilePlus size={12} />,   color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40' },
  edit:              { label: 'Edição',              icon: <FileEdit size={12} />,   color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40' },
  delete:            { label: 'Exclusão',            icon: <Trash2 size={12} />,     color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40' },
  export:            { label: 'Exportação',          icon: <Download size={12} />,   color: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40' },
  print:             { label: 'Impressão',           icon: <Printer size={12} />,    color: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800' },
  permission_change: { label: 'Permissão',           icon: <ShieldAlert size={12} />,color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40' },
  password_reset:    { label: 'Reset de senha',      icon: <KeyRound size={12} />,   color: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40' },
}

function formatLogTime(date: Date): string {
  const now  = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (diff < 1)    return 'agora mesmo'
  if (diff < 60)   return `há ${diff}min`
  if (diff < 1440) return `há ${Math.floor(diff / 60)}h · ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function LogsSection({ userId }: { userId: string }) {
  const logs = mockActivityLogs
    .filter(l => l.userId === userId)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 20)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 py-8 border-t border-slate-100 dark:border-slate-800">
      <div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Activity size={15} />
          <h2 className="text-sm font-semibold">Atividade recente</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">Últimas 20 ações registradas do usuário no sistema</p>
      </div>

      <div>
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <Activity size={24} className="mb-2 opacity-30" />
            <p className="text-sm">Nenhuma atividade registrada</p>
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map((log, i) => <LogRow key={log.id} log={log} isFirst={i === 0} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function LogRow({ log, isFirst }: { log: ActivityLog; isFirst: boolean }) {
  const meta  = LOG_META[log.action]
  const modColor = MODULE_COLOR[log.module.toLowerCase()] ?? '#6b7280'

  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors',
      isFirst && 'bg-slate-50/60 dark:bg-slate-800/20',
    )}>
      {/* Ícone da ação */}
      <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5', meta.color)}>
        {meta.icon}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{meta.label}</span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: modColor + '1a', color: modColor }}
          >
            {log.module}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{log.description}</p>
      </div>

      {/* Metadados */}
      <div className="text-right shrink-0">
        <p className="text-[11px] text-slate-400 whitespace-nowrap">{formatLogTime(log.at)}</p>
        <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">{log.ip}</p>
      </div>
    </div>
  )
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function ViewSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 py-8 border-t border-slate-100 dark:border-slate-800 first:border-t-0 first:pt-0">
      <div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          {icon}
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function ReadField({
  label, value, icon, className,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-slate-300 dark:text-slate-600 shrink-0">{icon}</span>}
        <p className="text-sm text-slate-800 dark:text-slate-200 break-all">{value || '—'}</p>
      </div>
    </div>
  )
}
