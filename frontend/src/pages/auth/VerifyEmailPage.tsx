import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Mail, ShieldCheck, CheckCircle2, AlertTriangle,
  Moon, Sun,
} from 'lucide-react'
import { authApi } from '../../api/auth'
import { HttpError } from '../../api/client'
import { BrandName } from '../../components/shared/BrandName'
import { useTheme } from '../../hooks/useTheme'

type State = 'working' | 'ok' | 'invalid' | 'missing'

export function VerifyEmailPage() {
  const { theme, toggle } = useTheme()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<State>(token ? 'working' : 'missing')
  const [errorMsg, setErrorMsg] = useState('')
  // Guarda contra chamada dupla do ``useEffect`` em React StrictMode (dev):
  // a primeira consome o token (200), a segunda cairia em 401 por token
  // já usado e sobrescreveria o state pra "invalid". Persistência do ref
  // entre re-renders mantém a checagem idempotente por sessão de página.
  const called = useRef(false)

  useEffect(() => {
    if (!token || called.current) return
    called.current = true
    authApi.confirmEmail(token)
      .then(() => setState('ok'))
      .catch(err => {
        let msg = 'Este link é inválido ou expirou.'
        if (err instanceof HttpError && err.message) msg = err.message
        setErrorMsg(msg)
        setState('invalid')
      })
  }, [token])

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

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm text-center space-y-4">
          {state === 'working' && (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center">
                <Mail size={28} className="text-sky-500 animate-pulse" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Confirmando seu e-mail…
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Isso leva só um segundo.
              </p>
            </>
          )}

          {state === 'ok' && (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                E-mail confirmado
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pronto. Agora você pode usar este e-mail para fazer login no zSaúde.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400"
              >
                Ir para o login
              </Link>
            </>
          )}

          {state === 'invalid' && (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                <AlertTriangle size={28} className="text-amber-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Link inválido ou expirado
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{errorMsg}</p>
              <p className="text-xs text-slate-400">
                Entre na sua conta e peça um novo link em <strong>Minha Conta</strong>.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400"
              >
                <ArrowLeft size={14} />
                Voltar para o login
              </Link>
            </>
          )}

          {state === 'missing' && (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                <AlertTriangle size={28} className="text-amber-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Link incompleto
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Este link está sem o token de verificação. Abra o e-mail completo
                e clique no botão &quot;Confirmar e-mail&quot;.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400"
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
