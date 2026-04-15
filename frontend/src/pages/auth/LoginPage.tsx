import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { HttpError } from '../../api/client'
import { Eye, EyeOff } from 'lucide-react'

export function LoginPage() {
  const { login, autoSelectContext, selectSystem } = useAuthStore()
  const navigate = useNavigate()
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
      if (err instanceof HttpError) {
        if (err.status === 429) setError('Muitas tentativas. Aguarde alguns instantes.')
        else setError(err.message || 'Usuário ou senha inválidos.')
      } else {
        setError('Não foi possível conectar ao servidor.')
      }
      setLoading(false)
      return
    }

    // MASTER vai direto pra área da plataforma — sem seleção de contexto.
    const me = useAuthStore.getState().user
    if (me?.level === 'master') {
      navigate('/sys', { replace: true })
      setLoading(false)
      return
    }

    // Demais usuários: auto-seleção de contexto (1 município + 1 unidade) ou
    // encaminha para as telas de seleção.
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
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 flex-col justify-between p-12 relative overflow-hidden">
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
        {/* Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />

        <div className="relative">
          <span className="text-2xl font-bold text-white tracking-tight">
            z<span className="text-sky-400">Saúde</span>
          </span>
        </div>

        <div className="relative space-y-6">
          <div className="space-y-3">
            <h2 className="text-4xl font-bold text-white leading-tight">
              Saúde pública,<br />gestão inteligente.
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              Plataforma integrada para gestão ambulatorial, laboratorial e hospitalar do município.
            </p>
          </div>

          <div className="flex items-center gap-6">
            {['Clínica', 'Diagnóstico', 'Hospitalar', 'Planos', 'Fiscal', 'Operações'].map((m) => (
              <div key={m} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400/60" />
                <span className="text-xs text-slate-500">{m}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-600">
          © {new Date().getFullYear()} Secretaria Municipal de Saúde
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <span className="text-2xl font-bold tracking-tight">
              z<span className="text-sky-500">Saúde</span>
            </span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
            <p className="text-slate-500 text-sm mt-1">Acesse com suas credenciais institucionais</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Usuário</label>
              <input
                value={form.login}
                onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                placeholder="seu.login"
                autoComplete="username"
                className="w-full h-11 px-3.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Senha</label>
                <a href="#" className="text-xs text-sky-600 hover:text-sky-700">Esqueceu?</a>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-11 px-3.5 pr-11 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-sky-500 hover:bg-sky-600 disabled:opacity-70 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            Problemas de acesso?{' '}
            <a href="#" className="text-sky-600 hover:underline">Contate o suporte</a>
          </p>
        </div>
      </div>
    </div>
  )
}
