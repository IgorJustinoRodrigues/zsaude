import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, User, Mail, Phone, MapPin, Building2, Shield,
  Eye as EyeIcon, EyeOff, KeyRound, RefreshCw, Check, X, Copy, Lock,
  UserCheck, UserX, ShieldOff, Activity as ActivityIcon, Clock, LogOut as LogOutIcon,
  Stethoscope, AlertTriangle,
} from 'lucide-react'
import { initials, cn } from '../../lib/utils'
import { userApi, type UserDetail } from '../../api/users'
import { sessionsApi, type SessionRead } from '../../api/sessions'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
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
      toast.success('Senha redefinida', `${userName} deverá usar a nova senha no próximo acesso.`)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao redefinir senha.'
      setError(msg)
      toast.error('Falha ao redefinir senha', msg)
    } finally {
      setLoading(false)
    }
  }

  const copyPassword = async () => {
    if (!generated) return
    try {
      await navigator.clipboard.writeText(generated)
      setCopied(true)
      toast.success('Senha copiada', 'Cola em local seguro antes de entregar ao usuário.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar', 'Seu navegador bloqueou o acesso ao clipboard.')
    }
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
  const { pathname } = useLocation()
  // MASTER acessa via /sys/usuarios; demais via /ops/usuarios.
  const base = pathname.startsWith('/sys/') ? '/sys/usuarios' : '/ops/usuarios'
  // Alvo é o próprio ator? Esconde ações destrutivas (inativar, bloquear,
  // resetar a própria senha).
  const currentUserId = useAuthStore(s => s.user?.id)
  const isSelf = currentUserId === id
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
      let msg = 'Não foi possível carregar o usuário.'
      if (e instanceof HttpError) {
        msg = e.status === 404 ? 'Usuário não encontrado.' : e.message
      }
      setError(msg)
      toast.error('Falha ao carregar usuário', msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id]) // eslint-disable-line

  const handleStatus = async (action: 'activate' | 'deactivate' | 'block') => {
    if (!user) return
    setStatusLoading(true)
    try {
      if (action === 'activate') {
        await userApi.activate(user.id)
        toast.success('Usuário ativado', user.name)
      } else if (action === 'deactivate') {
        await userApi.deactivate(user.id)
        toast.success('Usuário inativado', `${user.name} não poderá mais acessar.`)
      } else {
        await userApi.block(user.id)
        toast.warning('Usuário bloqueado', `Todas as sessões ativas de ${user.name} foram encerradas.`)
      }
      await load()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Erro ao atualizar status.'
      setError(msg)
      toast.error('Falha ao atualizar status', msg)
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
        <button onClick={() => navigate(base)} className="mt-3 text-xs text-sky-500 hover:underline">
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
          <button onClick={() => navigate(base)}
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

          {/* Ações de status — escondidas pra própria conta */}
          {!isSelf && user.status !== 'Ativo' && (
            <StatusBtn icon={<UserCheck size={13} />} label="Ativar" color="emerald"
              onClick={() => handleStatus('activate')} disabled={statusLoading} />
          )}
          {!isSelf && user.status === 'Ativo' && (
            <StatusBtn icon={<UserX size={13} />} label="Inativar" color="slate"
              onClick={() => handleStatus('deactivate')} disabled={statusLoading} />
          )}
          {!isSelf && user.status !== 'Bloqueado' && (
            <StatusBtn icon={<ShieldOff size={13} />} label="Bloquear" color="red"
              onClick={() => handleStatus('block')} disabled={statusLoading} />
          )}

          {/* Reset de senha — também escondido pra própria conta
              (use "Minha conta" → "Alterar senha"). */}
          {!isSelf && (
            <button
              onClick={() => setShowResetModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              <KeyRound size={14} />
              <span className="hidden sm:inline">Redefinir senha</span>
            </button>
          )}
          <button
            onClick={() => navigate(`${base}/${user.id}/editar`)}
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
            <ReadField label="CPF" value={user.cpf || '—'} icon={<Lock size={12} />} />
            <ReadField label="E-mail" value={user.email || '—'} icon={<Mail size={12} />} />
            <ReadField label="Telefone" value={user.phone || '—'} icon={<Phone size={12} />} />
            <ReadField label="Perfil" value={user.primaryRole} icon={<Shield size={12} />} />
          </div>
        </div>
      </ViewSection>

      {/* Sessões */}
      <SessionsSection userId={user.id} />

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
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {fac.modules.map((mod: SystemId) => (
                            <span
                              key={mod}
                              className="text-[10px] font-bold px-2 py-0.5 rounded"
                              style={{ backgroundColor: MODULE_COLOR[mod] + '1a', color: MODULE_COLOR[mod] }}
                            >
                              {MODULE_LABEL[mod]}
                            </span>
                          ))}
                          {/* Botão "Permissões" só faz sentido no contexto
                              OPS (ADMIN do município editando acesso). MASTER
                              vendo da plataforma não tem contexto de
                              trabalho — esconde o botão. */}
                          {base === '/ops/usuarios' && (
                            <button
                              onClick={() => navigate(`${base}/${user.id}/acessos/${fac.facilityAccessId}/permissoes`)}
                              title="Personalizar permissões deste acesso"
                              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border text-[10px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                            >
                              <KeyRound size={11} />
                              Permissões
                            </button>
                          )}
                        </div>
                      </div>
                      {fac.cnesBindings && fac.cnesBindings.length > 0 && (
                        <div className="mt-3 ml-5 space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Stethoscope size={10} />
                            Vínculos CNES
                          </p>
                          <div className="space-y-1">
                            {fac.cnesBindings.map(b => {
                              const userCpfDigits = (user.cpf || '').replace(/\D/g, '')
                              const mismatch = userCpfDigits.length === 11
                                && b.cnesSnapshotCpf
                                && b.cnesSnapshotCpf.replace(/\D/g, '') !== userCpfDigits
                              return (
                                <div key={b.id}
                                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
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
                                        CPF {b.cnesSnapshotCpf.slice(0,3)}.{b.cnesSnapshotCpf.slice(3,6)}.{b.cnesSnapshotCpf.slice(6,9)}-{b.cnesSnapshotCpf.slice(9,11)}
                                      </p>
                                    )}
                                    {mismatch && (
                                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                                        <AlertTriangle size={10} />
                                        CPF divergente do cadastro do usuário.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
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

// ─── SessionsSection ──────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}min` : `${h}h`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
}

const END_REASON_LABEL: Record<string, string> = {
  logout:             'Saída',
  expired:            'Expirada',
  revoked_replay:     'Revogada (replay)',
  revoked_by_admin:   'Revogada por admin',
  user_blocked:       'Usuário bloqueado',
  user_deactivated:   'Usuário inativado',
  level_changed:      'Nível alterado',
}

function SessionsSection({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<SessionRead[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const list = await sessionsApi.userSessions(userId, 20)
      setSessions(list)
    } catch (e) {
      if (e instanceof HttpError && e.status !== 403) {
        toast.error('Falha ao carregar sessões', e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [userId]) // eslint-disable-line

  const revoke = async (sid: string) => {
    setRevoking(sid)
    try {
      await sessionsApi.revokeSession(userId, sid)
      toast.success('Sessão encerrada')
      await load()
    } catch (e) {
      toast.error('Falha ao encerrar sessão', e instanceof HttpError ? e.message : '')
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 py-8 border-t border-slate-100 dark:border-slate-800">
      <div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <ActivityIcon size={15} />
          <h2 className="text-sm font-semibold">Sessões recentes</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Últimos logins. Online = atividade nos últimos 2 minutos.
        </p>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="animate-spin w-4 h-4 text-sky-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            Nenhuma sessão registrada ainda.
          </p>
        ) : (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  s.isOnline ? 'bg-emerald-500' : s.isActive ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600',
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {formatWhen(s.startedAt)}
                    </p>
                    {s.isOnline && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        Online
                      </span>
                    )}
                    {!s.isOnline && s.isActive && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                        Ociosa
                      </span>
                    )}
                    {!s.isActive && s.endReason && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {END_REASON_LABEL[s.endReason] ?? s.endReason}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDuration(s.durationSeconds)}
                    </span>
                    {s.ip && <span className="font-mono">{s.ip}</span>}
                  </div>
                </div>
                {s.isActive && (
                  <button
                    onClick={() => revoke(s.id)}
                    disabled={revoking === s.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                    title="Encerrar sessão"
                  >
                    <LogOutIcon size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
