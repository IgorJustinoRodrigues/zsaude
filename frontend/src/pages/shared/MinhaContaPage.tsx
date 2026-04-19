import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  User2, Save, Calendar, Mail, Phone, ScrollText, ScanFace, Loader2,
  Lock, AlertTriangle, Clock, CheckCircle2, Send, Pencil, X,
} from 'lucide-react'
import { authApi, type MeResponse, type UpdateMeInput } from '../../api/auth'
import { auditApi, type AuditLogItem } from '../../api/audit'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { UserPhotoField } from '../ops/components/UserPhotoField'
import { ChangePasswordModal } from '../../components/ui/ChangePasswordModal'
import { labelAction, labelSeverity, labelModule } from '../../lib/auditLabels'
import { cn } from '../../lib/utils'

const SEV_STYLE: Record<string, string> = {
  info:     'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  warning:  'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  error:    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('pt-BR')
}

function maskPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export function MinhaContaPage() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [name, setName] = useState('')
  const [socialName, setSocialName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [faceOptIn, setFaceOptIn] = useState(true)

  // Logs
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [loadingLogs, setLoadingLogs] = useState(true)

  // Modal de senha
  const [showChangePassword, setShowChangePassword] = useState(false)

  const loadMe = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authApi.readMe()
      setMe(res)
      setName(res.name)
      setSocialName(res.socialName || '')
      setEmail(res.email || '')
      setPhone(res.phone || '')
      setBirthDate(res.birthDate || '')
      setFaceOptIn(res.faceOptIn)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao carregar perfil.'
      toast.error('Erro', msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const res = await auditApi.listMine({ page: 1, pageSize: 30 })
      setLogs(res.items)
    } catch {
      /* ignora — painel de logs não é crítico */
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => { void loadMe() }, [loadMe])
  useEffect(() => { void loadLogs() }, [loadLogs])

  const dirty = useMemo(() => {
    if (!me) return false
    return (
      name !== me.name ||
      (socialName || '') !== (me.socialName || '') ||
      email !== (me.email || '') ||
      phone !== (me.phone || '') ||
      birthDate !== (me.birthDate || '') ||
      faceOptIn !== me.faceOptIn
    )
  }, [me, name, socialName, email, phone, birthDate, faceOptIn])

  async function handleSave() {
    if (!me || !dirty || saving) return
    setSaving(true)
    try {
      const payload: UpdateMeInput = {}
      if (name !== me.name) payload.name = name
      if ((socialName || '') !== (me.socialName || '')) payload.socialName = socialName
      if (email !== (me.email || '')) payload.email = email
      if (phone !== (me.phone || '')) payload.phone = phone
      if (birthDate !== (me.birthDate || '')) payload.birthDate = birthDate || null
      if (faceOptIn !== me.faceOptIn) payload.faceOptIn = faceOptIn

      const updated = await authApi.updateMe(payload)
      setMe(updated)
      useAuthStore.setState({ user: updated })
      // Ressincroniza o form com o backend. Importante pro e-mail: se o
      // usuário pediu troca, o backend mantém o ``email`` atual e coloca o
      // novo em ``pending_email``. Sem este reset, o state local ficaria
      // com o valor digitado e o badge "aguardando confirmação" nem
      // apareceria até o próximo refresh.
      setName(updated.name ?? '')
      setSocialName(updated.socialName ?? '')
      setPhone(updated.phone ?? '')
      setEmail(updated.email ?? '')
      setBirthDate(updated.birthDate ?? '')
      setFaceOptIn(!!updated.faceOptIn)

      if (updated.pendingEmail) {
        toast.success(
          'Link de confirmação enviado',
          `Confirme em ${updated.pendingEmail} para ativar o novo e-mail.`,
        )
      } else {
        toast.success('Perfil atualizado', 'Suas informações foram salvas.')
      }
      void loadLogs()
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao salvar.'
      toast.error('Erro ao salvar', msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !me) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={22} className="text-sky-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho + ações */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <User2 size={20} className="text-sky-500" />
            Minha conta
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dados pessoais, foto de perfil e histórico das suas ações.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void loadMe() }}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar alterações
          </button>
        </div>
      </div>

      {/* Banner de senha expirando/expirada */}
      {me.passwordExpired ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-300 dark:bg-red-950/40 dark:border-red-900">
          <AlertTriangle size={18} className="text-red-600 dark:text-red-400 shrink-0" />
          <div className="flex-1 text-sm text-red-700 dark:text-red-400">
            <strong>Sua senha expirou.</strong> Troque agora para continuar usando o sistema.
          </div>
          <button type="button" onClick={() => setShowChangePassword(true)}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors">
            Trocar senha
          </button>
        </div>
      ) : me.passwordExpiresInDays !== null && me.passwordExpiresInDays <= 7 ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/40 dark:border-amber-900">
          <Clock size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 text-sm text-amber-700 dark:text-amber-400">
            Sua senha expira em <strong>{me.passwordExpiresInDays} {me.passwordExpiresInDays === 1 ? 'dia' : 'dias'}</strong>.
            Troque já para evitar interrupção.
          </div>
          <button type="button" onClick={() => setShowChangePassword(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors">
            Trocar agora
          </button>
        </div>
      ) : null}

      {/* Layout 2 colunas em telas grandes — esquerda: foto + privacidade + logs
          direita: dados pessoais.
          No mobile/tablet tudo empilha. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-5">
        {/* ── Coluna esquerda ── */}
        <div className="space-y-5">
          <Section title="Foto" subtitle="Sua imagem no sistema e no reconhecimento facial.">
            <UserPhotoField userId={me.id} userName={me.socialName || me.name} />
          </Section>

          <Section
            title="Segurança"
            subtitle="Altere sua senha periodicamente."
          >
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {me.passwordExpiresAt ? (
                  <>
                    Sua senha foi alterada pela última vez há pouco tempo.{' '}
                    {me.passwordExpiresInDays !== null && me.passwordExpiresInDays > 0 && (
                      <>Expira em <strong>{me.passwordExpiresInDays} dia(s)</strong>.</>
                    )}
                  </>
                ) : (
                  'Política de expiração de senha desativada.'
                )}
                {' '}Não é possível reutilizar as últimas 5 senhas.
              </div>
              <button
                type="button"
                onClick={() => setShowChangePassword(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-medium transition-colors"
              >
                <Lock size={13} />
                Alterar senha
              </button>
            </div>
          </Section>

          <Section
            title="Reconhecimento facial"
            subtitle="Controle se sua foto pode ser usada em buscas biométricas."
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={faceOptIn}
                onChange={e => setFaceOptIn(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-sky-500"
              />
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                  <ScanFace size={14} className="text-sky-500" />
                  Permitir uso biométrico
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Ao desativar, sua foto continua no sistema para identificação visual,
                  mas o embedding biométrico é removido. Reativar gera novo embedding
                  a partir da próxima foto.
                </p>
              </div>
            </label>
          </Section>
        </div>

        {/* ── Coluna direita ── */}
        <div className="space-y-5">
          <Section title="Dados pessoais" subtitle="Informações exibidas no sistema e nos logs.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nome completo *" className="sm:col-span-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Como aparece em documentos"
                  className={inputCls}
                />
              </Field>
              <Field
                label="Nome social"
                hint="Como você quer ser chamado — aparece no lugar do nome completo nas telas."
                className="sm:col-span-2"
              >
                <input
                  value={socialName}
                  onChange={e => setSocialName(e.target.value)}
                  placeholder="Opcional"
                  className={inputCls}
                />
              </Field>
              <Field label="E-mail *" icon={<Mail size={13} />}>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={inputCls}
                />
                <EmailVerificationStatus
                  me={me}
                  currentEmail={email}
                  onResent={loadMe}
                  onEditPending={v => setEmail(v)}
                />
              </Field>
              <Field label="Telefone" icon={<Phone size={13} />}>
                <input
                  value={phone}
                  onChange={e => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className={inputCls}
                />
              </Field>
              <Field label="Data de nascimento" icon={<Calendar size={13} />}>
                <input
                  type="date"
                  value={birthDate || ''}
                  onChange={e => setBirthDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="CPF" hint="Usado para entrar no sistema.">
                <input value={me.cpf || '—'} disabled className={cn(inputCls, 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed')} />
              </Field>
              <Field label="Perfil principal">
                <input value={me.primaryRole || '—'} disabled className={cn(inputCls, 'bg-slate-50 dark:bg-slate-800 cursor-not-allowed')} />
              </Field>
            </div>
          </Section>

          {/* Últimos logs */}
          <Section
            title="Últimas atividades"
            subtitle="Ações recentes feitas pela sua conta."
            action={
              <span className="text-[11px] text-slate-400">
                {logs.length} {logs.length === 1 ? 'evento' : 'eventos'}
              </span>
            }
          >
            {loadingLogs ? (
              <div className="py-6 flex justify-center">
                <Loader2 size={18} className="text-slate-400 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                <ScrollText size={28} className="mx-auto mb-2 opacity-40" />
                Nenhuma ação registrada ainda.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 -mx-2 max-h-[520px] overflow-y-auto scrollbar-thin">
                {logs.map(l => (
                  <li key={l.id} className="px-2 py-2.5 flex items-start gap-3">
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full tracking-wide shrink-0 mt-1',
                      SEV_STYLE[l.severity] ?? SEV_STYLE.info,
                    )}>
                      {labelSeverity(l.severity)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {labelModule(l.module)}
                        </span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{labelAction(l.action)}</span>
                        <span className="text-[11px] text-slate-400 ml-auto shrink-0">{fmtDateTime(l.at)}</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 break-words leading-snug">
                        {l.description || '—'}
                      </p>
                      {l.ip && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{l.ip}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* Modal — required quando senha expirou ou é provisória. */}
      {(showChangePassword || me.passwordExpired || me.mustChangePassword) && (
        <ChangePasswordModal
          required={me.passwordExpired || me.mustChangePassword}
          reason={me.mustChangePassword && !me.passwordExpired ? 'provisional' : 'expired'}
          onClose={() => setShowChangePassword(false)}
          onChanged={() => { void loadMe(); void loadLogs() }}
        />
      )}
    </div>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────────

function Section({
  title, subtitle, action, children,
}: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({
  label, hint, icon, children, className,
}: {
  label: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 leading-relaxed">{hint}</p>}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 text-slate-800 dark:text-slate-200'

function EmailVerificationStatus({
  me, currentEmail, onResent, onEditPending,
}: {
  me: MeResponse
  currentEmail: string
  onResent: () => Promise<void> | void
  /** Põe este valor no input de e-mail pra usuário corrigir um pending com typo. */
  onEditPending: (value: string) => void
}) {
  const [sending, setSending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  // O usuário pode ter editado o campo e ainda não salvado; nesse caso o
  // "e-mail pendente de verificação" é o que o backend já conhece.
  const savedEmail = me.email || ''
  const dirty = currentEmail.trim() !== savedEmail
  const verified = !!me.emailVerifiedAt
  const pending = me.pendingEmail

  const resend = async () => {
    setSending(true)
    try {
      const r = await authApi.requestEmailVerification()
      setSentTo(r.emailTarget)
      toast.success('Link enviado', `Confirme em ${r.emailTarget}`)
      await onResent()
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Erro ao enviar link.'
      toast.error('Falha ao enviar link', msg)
    } finally {
      setSending(false)
    }
  }

  const cancelPending = async () => {
    if (!confirm(`Descartar a troca para ${pending}? O e-mail atual (${savedEmail}) continua válido.`)) return
    setCancelling(true)
    try {
      // Re-submeter o e-mail atual sinaliza ao backend pra limpar o pending.
      await authApi.updateMe({ email: savedEmail })
      toast.success('Troca cancelada', `Mantido ${savedEmail}`)
      await onResent()
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Erro ao cancelar.'
      toast.error('Falha ao cancelar', msg)
    } finally {
      setCancelling(false)
    }
  }

  if (dirty) {
    // Dois casos: usuário está corrigindo um typo no pending, ou está
    // digitando uma troca nova (sem pending). O texto muda pra não
    // confundir — e no caso de correção oferece desfazer.
    const editingPending = pending && currentEmail.trim() !== pending
    if (pending) {
      return (
        <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 text-xs">
          <Pencil size={13} className="text-sky-500 mt-0.5 shrink-0" />
          <div className="flex-1 text-sky-800 dark:text-sky-300 space-y-1">
            <p>
              {editingPending
                ? <>Corrigindo o pendente <strong className="break-all">{pending}</strong>. Salve pra substituir.</>
                : <>Pendente <strong className="break-all">{pending}</strong> carregado no campo — edite e salve.</>}
            </p>
            <button
              type="button"
              onClick={() => onEditPending(savedEmail)}
              className="inline-flex items-center gap-1 font-medium text-sky-700 dark:text-sky-300 hover:underline"
              title="Desistir da edição e voltar ao e-mail atual"
            >
              <X size={11} />
              Desfazer edição
            </button>
          </div>
        </div>
      )
    }
    return (
      <p className="text-[11px] text-slate-400 mt-1">
        Salve as alterações para confirmar o novo e-mail.
      </p>
    )
  }

  if (pending) {
    return (
      <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs">
        <Clock size={13} className="text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 text-amber-800 dark:text-amber-300 space-y-1.5">
          <p>
            Aguardando confirmação de <strong className="break-all">{pending}</strong>.
            {sentTo === pending && ' Verifique a caixa de entrada.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button" onClick={resend} disabled={sending || cancelling}
              className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
            >
              <Send size={11} />
              {sending ? 'Enviando…' : 'Reenviar link'}
            </button>
            <button
              type="button" onClick={() => onEditPending(pending)} disabled={sending || cancelling}
              className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
              title="Editar o e-mail pendente (corrigir typo)"
            >
              <Pencil size={11} />
              Editar
            </button>
            <button
              type="button" onClick={cancelPending} disabled={sending || cancelling}
              className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
              title="Descartar a troca e manter o e-mail atual"
            >
              <X size={11} />
              {cancelling ? 'Cancelando…' : 'Cancelar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (verified) {
    return (
      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={12} />
        E-mail verificado
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
      <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
      <div className="flex-1 text-slate-700 dark:text-slate-300">
        E-mail não verificado.{' '}
        <button
          type="button" onClick={resend} disabled={sending}
          className="inline-flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-50"
        >
          <Send size={11} />
          {sending ? 'Enviando…' : 'Enviar link de confirmação'}
        </button>
      </div>
    </div>
  )
}
