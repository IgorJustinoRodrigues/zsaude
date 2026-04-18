import { useState } from 'react'
import { X, Lock, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import { authApi } from '../../api/auth'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

interface Props {
  /** Quando true, esconde o botão de fechar — usuário precisa trocar pra sair. */
  required?: boolean
  /** Motivo do bloqueio (muda o título e a mensagem). */
  reason?: 'expired' | 'provisional'
  onClose: () => void
  onChanged?: () => void
}

const RULES = [
  { id: 'length',  label: 'Ao menos 8 caracteres',  test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'Uma letra maiúscula',     test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'Uma letra minúscula',     test: (p: string) => /[a-z]/.test(p) },
  { id: 'digit',   label: 'Um número',               test: (p: string) => /[0-9]/.test(p) },
  { id: 'special', label: 'Um caractere especial',   test: (p: string) => /[!@#$%&*]/.test(p) },
] as const

export function ChangePasswordModal({
  required = false, reason, onClose, onChanged,
}: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Senha provisória (veio de reset admin): não pedimos a senha atual,
  // o backend já autenticou o token JWT e sabe que é must_change.
  const skipCurrent = reason === 'provisional'

  const rules = RULES.map(r => ({ ...r, ok: r.test(next) }))
  const allRulesOk = rules.every(r => r.ok)
  const passwordsMatch = next.length > 0 && next === confirm
  const canSubmit = (skipCurrent || current.length > 0) && allRulesOk && passwordsMatch && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await authApi.changePassword(skipCurrent ? null : current, next)
      toast.success('Senha alterada', 'Use a nova senha no próximo login.')
      onChanged?.()
      onClose()
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Falha ao alterar senha.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={required ? undefined : onClose}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {reason === 'provisional' ? 'Defina uma senha própria'
                : required ? 'Troque sua senha para continuar'
                : 'Alterar senha'}
            </h2>
          </div>
          {!required && (
            <button type="button" onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {required && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                {reason === 'provisional'
                  ? 'Você está usando uma senha provisória (gerada por um administrador). Defina uma senha pessoal antes de continuar.'
                  : 'Sua senha expirou. Defina uma nova senha para continuar usando o sistema.'}
              </span>
            </div>
          )}

          {!skipCurrent && (
            <Field label="Senha atual">
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  className={inputCls}
                />
              </div>
            </Field>
          )}

          <Field label="Nova senha">
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={next}
                onChange={e => setNext(e.target.value)}
                autoComplete="new-password"
                className={cn(inputCls, 'pr-10')}
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
            {rules.map(r => (
              <li key={r.id} className={cn(
                'flex items-center gap-1.5',
                r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400',
              )}>
                <Check size={11} className={cn(r.ok ? 'opacity-100' : 'opacity-30')} />
                {r.label}
              </li>
            ))}
          </ul>

          <Field
            label="Confirmar nova senha"
            error={confirm.length > 0 && !passwordsMatch ? 'As senhas não batem.' : undefined}
          >
            <input
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={inputCls}
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs text-red-700 dark:text-red-400">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          {!required && (
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
          )}
          <button type="submit" disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Salvando...' : 'Alterar senha'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Building blocks ──────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 text-slate-800 dark:text-slate-200'

function Field({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
