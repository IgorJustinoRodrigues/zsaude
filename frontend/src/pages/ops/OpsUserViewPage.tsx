import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, User, Mail, Phone, MapPin, Building2, Shield,
  Eye as EyeIcon, EyeOff, KeyRound, RefreshCw, Check, X, Copy, Lock,
  UserCheck, UserX, ShieldOff,
} from 'lucide-react'
import { initials, cn } from '../../lib/utils'
import { userApi, type UserDetail } from '../../api/users'
import { HttpError } from '../../api/client'
import type { SystemId } from '../../types'

// ─── Modal de reset de senha (agora consome a API) ────────────────────────────

function ResetPasswordModal({
  userId, userName, onClose,
}: { userId: string; userName: string; onClose: () => void }) {
  const [password,  setPassword]  = useState('')     // provisória, opcional
  const [generated, setGenerated] = useState<string | null>(null)
  const [showPwd,   setShowPwd]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [copied,    setCopied]    = useState(false)

  const rules = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    lower:   /[a-z]/.test(password),
    digit:   /[0-9]/.test(password),
    special: /[!@#$%&*]/.test(password),
  }
  const pwdValid = Object.values(rules).every(Boolean)

  const handleGenerateLocally = () => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'
    const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
    const req  = [pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), pick('abcdefghijklmnopqrstuvwxyz'), pick('0123456789'), pick('!@#$%&*')]
    const rest = Array.from({ length: 8 }, () => pick(charset))
    setPassword([...req, ...rest].sort(() => Math.random() - 0.5).join(''))
    setShowPwd(true)
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await userApi.resetPassword(userId, password && pwdValid ? password : undefined)
      setGenerated(res.newPassword)
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'Erro ao redefinir senha.')
    } finally {
      setLoading(false)
    }
  }

  const copyPassword = async () => {
    if (!generated) return
    try {
      await navigator.clipboard.writeText(generated)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
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
          {generated ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <Check size={22} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Senha redefinida</p>
                <p className="text-xs text-slate-400 mt-1">Entregue a senha provisória abaixo ao usuário. Ela não será mostrada novamente.</p>
              </div>
              <div className="w-full relative">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 pr-10 font-mono text-sm text-slate-700 dark:text-slate-200 tracking-widest border border-slate-200 dark:border-slate-700 break-all">
                  {generated}
                </div>
                <button
                  onClick={copyPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-sky-500 hover:bg-white dark:hover:bg-slate-900 transition-colors"
                  title={copied ? 'Copiado' : 'Copiar'}
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
              <button onClick={onClose} className="mt-2 px-5 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors">
                Fechar
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Nova senha <span className="text-slate-400 font-normal">(ou deixe vazio para gerar no servidor)</span>
                </label>
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
                    onClick={handleGenerateLocally}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors whitespace-nowrap"
                  >
                    <RefreshCw size={12} />
                    Sugerir
                  </button>
                </div>
              </div>

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
                        {ok ? <Check size={11} /> : <X size={11} className="text-slate-300 dark:text-slate-600" />}
                        {rule.label}
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                Todas as sessões ativas do usuário serão encerradas após a redefinição.
              </p>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-800 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading || (password !== '' && !pwdValid)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <KeyRound size={13} />
                  {loading ? 'Redefinindo...' : 'Redefinir senha'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Constantes ───────────────────────────────────────────────────────────────

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

// ─── Página ───────────────────────────────────────────────────────────────────

export function OpsUserViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showResetModal, setShowResetModal] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      setUser(await userApi.get(id))
    } catch (e) {
      if (e instanceof HttpError) {
        setError(e.status === 404 ? 'Usuário não encontrado.' : e.message)
      } else {
        setError('Não foi possível carregar o usuário.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id]) // eslint-disable-line

  const handleStatus = async (action: 'activate' | 'deactivate' | 'block') => {
    if (!user) return
    setStatusLoading(true)
    try {
      if (action === 'activate') await userApi.activate(user.id)
      else if (action === 'deactivate') await userApi.deactivate(user.id)
      else await userApi.block(user.id)
      await load()
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'Erro ao atualizar status.')
    } finally {
      setStatusLoading(false)
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

  if (error || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <User size={40} className="mb-3 opacity-30" />
        <p className="text-sm text-slate-500">{error || 'Usuário não encontrado'}</p>
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
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', STATUS_STYLE[user.status])}>
            {user.status}
          </span>

          {/* Ações de status */}
          {user.status !== 'Ativo' && (
            <StatusBtn icon={<UserCheck size={13} />} label="Ativar" color="emerald"
              onClick={() => handleStatus('activate')} disabled={statusLoading} />
          )}
          {user.status === 'Ativo' && (
            <StatusBtn icon={<UserX size={13} />} label="Inativar" color="slate"
              onClick={() => handleStatus('deactivate')} disabled={statusLoading} />
          )}
          {user.status !== 'Bloqueado' && (
            <StatusBtn icon={<ShieldOff size={13} />} label="Bloquear" color="red"
              onClick={() => handleStatus('block')} disabled={statusLoading} />
          )}

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

      {/* Dados pessoais */}
      <ViewSection title="Dados pessoais" icon={<User size={15} />}>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="shrink-0 flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-full bg-sky-500 flex items-center justify-center text-xl font-bold text-white ring-2 ring-slate-200 dark:ring-slate-700">
              {initials(user.name)}
            </div>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
            <ReadField label="Nome completo" value={user.name} className="sm:col-span-2" />
            <ReadField label="Login" value={user.login} icon={<Lock size={12} />} />
            <ReadField label="CPF" value={user.cpf} />
            <ReadField label="E-mail" value={user.email} icon={<Mail size={12} />} />
            <ReadField label="Telefone" value={user.phone || '—'} icon={<Phone size={12} />} />
            <ReadField label="Perfil" value={user.primaryRole} icon={<Shield size={12} />} />
          </div>
        </div>
      </ViewSection>

      {/* Acessos */}
      <ViewSection title="Acessos por município" icon={<Building2 size={15} />}>
        {user.municipalities.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Usuário sem vínculos cadastrados.</p>
        ) : (
          <div className="space-y-4">
            {user.municipalities.map(mun => (
              <div key={mun.municipalityId} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                  <MapPin size={13} className="text-slate-400 shrink-0" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {mun.municipalityName}
                    <span className="ml-1 font-normal text-slate-400">– {mun.municipalityState}</span>
                  </p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mun.facilities.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400 italic">Sem unidades vinculadas neste município.</p>
                  ) : mun.facilities.map(fac => (
                    <div key={fac.facilityId} className="px-4 py-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <Building2 size={12} className="text-slate-400" />
                            {fac.facilityName}
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {fac.facilityType}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 ml-5">
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
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ViewSection>
    </div>

    {showResetModal && (
      <ResetPasswordModal
        userId={user.id}
        userName={user.name}
        onClose={() => setShowResetModal(false)}
      />
    )}
    </>
  )
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function StatusBtn({
  icon, label, color, onClick, disabled,
}: {
  icon: React.ReactNode; label: string
  color: 'emerald' | 'slate' | 'red'
  onClick: () => void; disabled?: boolean
}) {
  const colorMap = {
    emerald: 'hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400',
    slate:   'hover:border-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
    red:     'hover:border-red-400 hover:text-red-600 dark:hover:text-red-400',
  }[color]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        colorMap,
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

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
  label: string; value: string; icon?: React.ReactNode; className?: string
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
