import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { authApi } from '../../api/auth'
import { HttpError } from '../../api/client'
import { BrandName } from '../../components/shared/BrandName'
import { useTheme } from '../../hooks/useTheme'
import { Moon, Sun } from 'lucide-react'

export function ForgotPasswordPage() {
  const { theme, toggle } = useTheme()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Informe um e-mail.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await authApi.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      let msg = 'Não foi possível solicitar a redefinição. Tente novamente em alguns minutos.'
      if (err instanceof HttpError) {
        if (err.status === 429) msg = 'Muitas solicitações. Aguarde alguns minutos e tente novamente.'
        else if (err.message) msg = err.message
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <button
        type="button"
        onClick={toggle}
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
          {sent ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Verifique seu e-mail
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Se o e-mail <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span> estiver cadastrado,
                você receberá instruções para redefinir a senha em alguns
                instantes. O link é válido por 15 minutos.
              </p>
              <p className="text-xs text-slate-400">
                Não recebeu? Cheque a pasta de spam ou tente novamente com outro e-mail.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300"
              >
                <ArrowLeft size={14} />
                Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Recuperar senha
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Informe o e-mail cadastrado. Enviaremos um link para você criar uma nova senha.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="email@exemplo.gov.br"
                      autoComplete="email"
                      autoFocus
                      className="w-full h-11 pl-9 pr-3.5 text-sm rounded-xl transition-all
                        bg-white dark:bg-slate-900
                        border border-slate-200 dark:border-slate-700
                        text-slate-900 dark:text-white
                        placeholder:text-slate-400 dark:placeholder:text-slate-500
                        focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 dark:focus:border-sky-500"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/20 dark:shadow-sky-500/10 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Enviando…
                    </>
                  ) : 'Enviar link de redefinição'}
                </button>
              </form>

              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <ArrowLeft size={14} />
                Voltar para o login
              </Link>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5">
          <ShieldCheck size={12} />
          Conexão segura · LGPD · Auditoria completa
        </p>
      </div>
    </div>
  )
}
