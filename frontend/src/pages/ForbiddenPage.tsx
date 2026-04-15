import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldOff, ArrowLeft, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export function ForbiddenPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { context, currentSystem, isAuthenticated, logout } = useAuthStore()

  const attempted = (location.state as { attempted?: string } | null)?.attempted

  // Destino do "voltar":
  // 1. módulo ativo (se ainda está no contexto) → tela inicial dele
  // 2. primeiro módulo do contexto → home
  // 3. sem contexto + logado → selecionar unidade
  // 4. sem login → /login
  const backTarget = (() => {
    if (!isAuthenticated) return '/login'
    if (context) {
      if (currentSystem && context.modules.includes(currentSystem)) return `/${currentSystem}`
      if (context.modules.length > 0) return `/${context.modules[0]}`
    }
    return '/selecionar-contexto'
  })()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-500">
          <ShieldOff size={28} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold tracking-widest uppercase text-red-500">403</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Acesso negado</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {attempted
              ? <>Você não tem permissão para acessar o módulo <strong className="text-slate-700 dark:text-slate-300 uppercase">{attempted}</strong> neste contexto de trabalho.</>
              : 'Você não tem permissão para acessar este recurso.'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => navigate(backTarget, { replace: true })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar
          </button>
          {isAuthenticated && (
            <button
              onClick={async () => { await logout(); navigate('/login', { replace: true }) }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <LogOut size={14} />
              Sair
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
