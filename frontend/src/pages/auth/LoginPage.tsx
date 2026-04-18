import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { Eye, EyeOff, Moon, Sun, ShieldCheck } from 'lucide-react'
import { BrandName } from '../../components/shared/BrandName'
import { useTheme } from '../../hooks/useTheme'

export function LoginPage() {
  const { login, autoSelectContext, selectSystem } = useAuthStore()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const [form, setForm] = useState({ login: 'igor.santos', password: 'Admin@123' })
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await login(form.login, form.password)
    } catch (err) {
      let msg = 'Usuário ou senha inválidos.'
      if (err instanceof HttpError) {
        if (err.status === 429) msg = 'Muitas tentativas. Aguarde alguns instantes.'
        else if (err.message) msg = err.message
      } else {
        msg = 'Não foi possível conectar ao servidor.'
      }
      setError(msg)
      toast.error('Não foi possível entrar', msg)
      setLoading(false)
      return
    }

    const loggedUser = useAuthStore.getState().user
    if (loggedUser) {
      toast.success(`Bem-vindo, ${loggedUser.name.split(' ')[0]}`)
    }

    const me = useAuthStore.getState().user
    if (me?.level === 'master') {
      navigate('/sys', { replace: true })
      setLoading(false)
      return
    }

    try {
      const modules = await autoSelectContext()
      if (modules) {
        if (modules.length === 1) {
          selectSystem(modules[0])
          navigate(`/${modules[0]}`, { replace: true })
        } else {
          navigate('/selecionar-sistema', { replace: true })
        }
      } else {
        navigate('/selecionar-contexto', { replace: true })
      }
    } catch {
      navigate('/selecionar-contexto', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      {/* Toggle tema — canto superior direito */}
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:scale-105 transition-all flex items-center justify-center shadow-sm"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Painel esquerdo (branding) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-black flex-col justify-between p-12">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glows */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl" />

        <div className="relative">
          <span className="text-2xl font-bold text-white tracking-tight">
            <BrandName accentClassName="text-sky-400" />
          </span>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl font-bold text-white leading-[1.1] tracking-tight">
              Saúde pública,<br />
              <span className="bg-gradient-to-r from-sky-300 to-cyan-200 bg-clip-text text-transparent">
                gestão inteligente.
              </span>
            </h2>
            <p className="text-slate-300 text-base leading-relaxed max-w-md">
              Plataforma integrada para gestão ambulatorial, laboratorial e
              hospitalar do município — com IA, reconhecimento facial e
              integração CadSUS em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {['Clínica', 'Diagnóstico', 'Hospitalar', 'Planos', 'Fiscal', 'Operações'].map((m) => (
              <div key={m} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                <span className="text-sm text-slate-400 font-medium">{m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} className="text-sky-400/70" />
          <span>Conexão segura · LGPD · Auditoria completa</span>
        </div>
      </div>

      {/* Painel direito (formulário) */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden mb-10 text-center">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <BrandName accentClassName="text-sky-500 dark:text-sky-400" />
            </span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Entrar
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              Acesse com suas credenciais institucionais
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Usuário
              </label>
              <input
                value={form.login}
                onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                placeholder="seu.login"
                autoComplete="username"
                className="w-full h-11 px-3.5 text-sm rounded-xl transition-all
                  bg-white dark:bg-slate-900
                  border border-slate-200 dark:border-slate-700
                  text-slate-900 dark:text-white
                  placeholder:text-slate-400 dark:placeholder:text-slate-500
                  focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 dark:focus:border-sky-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Senha
                </label>
                <a href="#" className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium">
                  Esqueceu?
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-11 px-3.5 pr-11 text-sm rounded-xl transition-all
                    bg-white dark:bg-slate-900
                    border border-slate-200 dark:border-slate-700
                    text-slate-900 dark:text-white
                    placeholder:text-slate-400 dark:placeholder:text-slate-500
                    focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 dark:focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
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
                  Entrando…
                </>
              ) : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 dark:text-slate-500 mt-8">
            Problemas de acesso?{' '}
            <a href="#" className="text-sky-600 dark:text-sky-400 hover:underline font-medium">
              Contate o suporte
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
