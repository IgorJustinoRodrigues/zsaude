import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/**
 * Guard: exige usuário autenticado.
 *
 * Sobre a hidratação: tokens ficam em localStorage (persist), mas `user`
 * e `contextOptions` são em memória. Em refresh/nova aba, precisamos
 * recarregá-los do backend antes de renderizar a rota. Enquanto hidrata,
 * mostramos um splash simples.
 */
export function RequireAuth() {
  const { isAuthenticated, accessToken, user, hydrated, hydrating, hydrate } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    if (!hydrated && accessToken) {
      void hydrate()
    } else if (!accessToken) {
      // nada para hidratar: marca como hidratado para evitar tela presa
      useAuthStore.setState({ hydrated: true })
    }
  }, [accessToken, hydrated, hydrate])

  if (!isAuthenticated || !accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Tokens existem mas ainda não carregamos user/options → splash.
  if (!user || hydrating || !hydrated) {
    return <HydratingSplash />
  }

  return <Outlet />
}

function HydratingSplash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin w-6 h-6 text-sky-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-xs text-slate-400">Carregando...</p>
      </div>
    </div>
  )
}
