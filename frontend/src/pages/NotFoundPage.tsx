import { useNavigate } from 'react-router-dom'
import { Compass, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export function NotFoundPage() {
  const navigate = useNavigate()
  const { isAuthenticated, context, currentSystem } = useAuthStore()

  // Mesma ordem de prioridade de ForbiddenPage: último módulo ativo > primeiro
  // do contexto > seleção de unidade > login.
  const homeTarget = (() => {
    if (!isAuthenticated) return '/login'
    if (context) {
      if (currentSystem && context.modules.includes(currentSystem)) return `/${currentSystem}`
      if (context.modules.length > 0) return `/${context.modules[0]}`
    }
    return '/selecionar-acesso'
  })()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-900 text-slate-400">
          <Compass size={28} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400">404</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Página não encontrada</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O endereço digitado não existe ou foi movido.
          </p>
        </div>
        <button
          onClick={() => navigate(homeTarget, { replace: true })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={14} />
          Voltar ao início
        </button>
      </div>
    </div>
  )
}
