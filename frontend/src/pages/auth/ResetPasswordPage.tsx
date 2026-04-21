import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Eye, EyeOff, RefreshCw, Check, X, Moon, Sun,
  ShieldCheck, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { authApi } from '../../api/auth'
import { HttpError } from '../../api/client'
import { BrandName } from '../../components/shared/BrandName'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../lib/utils'

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

export function ResetPasswordPage() {
  const { theme, toggle } = useTheme()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const rules = checkPassword(password)
  const pwdValid = Object.values(rules).every(Boolean)
  const matches = password.length > 0 && password === confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!pwdValid) {
      setError('A nova senha não atende aos requisitos abaixo.')
      return
    }
    if (!matches) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      let msg = 'Não foi possível redefinir a senha.'
      if (err instanceof HttpError) {
        if (err.status === 401) msg = 'O link é inválido ou expirou. Solicite uma nova redefinição.'
        else if (err.status === 409) msg = err.message || 'Nova senha não pode ser igual às anteriores.'
        else if (err.message) msg = err.message
      }
      setError(msg)
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthCard theme={theme} onToggleTheme={toggle}>
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
            <AlertTriangle size={28} className="text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Link inválido</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Este link de redefinição está incompleto. Solicite um novo na tela de login.
          </p>
          <Link
            to="/esqueci-senha"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400"
          >
            Solicitar novo link
          </Link>
        </div>
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard theme={theme} onToggleTheme={toggle}>
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Senha redefinida</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pronto! Você já pode entrar com a nova senha.
          </p>
          <p className="text-xs text-slate-400">Redirecionando para o login…</p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard theme={theme} onToggleTheme={toggle}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Criar nova senha
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Escolha uma senha forte. Você vai usá-la no próximo login.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Nova senha
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Digite uma senha forte"
                autoComplete="new-password"
                autoFocus
                className="w-full h-11 pl-3.5 pr-11 text-sm rounded-xl transition-all
                  bg-white dark:bg-slate-900
                  border border-slate-200 dark:border-slate-700
                  text-slate-900 dark:text-white
                  placeholder:text-slate-400 dark:placeholder:text-slate-500
                  focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 dark:focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setPassword(generatePassword()); setConfirm(''); setShowPassword(true) }}
              title="Gerar senha forte"
              className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Confirmar senha
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repita a nova senha"
            autoComplete="new-password"
            className={cn(
              'w-full h-11 px-3.5 text-sm rounded-xl transition-all',
              'bg-white dark:bg-slate-900',
              'border text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2',
              confirm && !matches
                ? 'border-rose-300 dark:border-rose-800 focus:ring-rose-200 focus:border-rose-400'
                : 'border-slate-200 dark:border-slate-700 focus:ring-sky-500/30 focus:border-sky-400',
            )}
          />
          {confirm && !matches && (
            <p className="text-[11px] text-rose-500">As senhas não coincidem.</p>
          )}
        </div>

        {password && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {([
              { key: 'length',  label: 'Mín. 8 caracteres' },
              { key: 'upper',   label: 'Letra maiúscula'   },
              { key: 'lower',   label: 'Letra minúscula'   },
              { key: 'digit',   label: 'Número'            },
              { key: 'special', label: 'Caractere especial' },
            ] as const).map(rule => {
              const ok = rules[rule.key]
              return (
                <div
                  key={rule.key}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors',
                    ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400',
                  )}
                >
                  {ok ? <Check size={12} /> : <X size={12} className="text-slate-300 dark:text-slate-600" />}
                  {rule.label}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !pwdValid || !matches}
          className="w-full h-11 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/20 dark:shadow-sky-500/10 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Salvando…
            </>
          ) : 'Redefinir senha'}
        </button>
      </form>

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft size={14} />
        Voltar para o login
      </Link>
    </AuthCard>
  )
}

function AuthCard({
  children, theme, onToggleTheme,
}: { children: React.ReactNode; theme: string; onToggleTheme: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:scale-105 transition-all flex items-center justify-center shadow-sm"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <BrandName accentClassName="text-sky-500 dark:text-sky-400" />
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm">
          {children}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck size={12} />
          Conexão segura · LGPD · Auditoria completa
        </p>
      </div>
    </div>
  )
}
