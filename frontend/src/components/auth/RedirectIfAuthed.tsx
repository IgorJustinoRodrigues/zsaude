import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/**
 * Rotas públicas: se já autenticado, redireciona.
 * - MASTER → /sys (área de plataforma, sem contexto de município)
 * - Outros → contexto ativo ou seleção de contexto
 */
export function RedirectIfAuthed() {
  const { isAuthenticated, user, context, currentSystem } = useAuthStore()

  if (isAuthenticated) {
    if (user?.level === 'master') {
      return <Navigate to="/sys" replace />
    }
    if (context && currentSystem && context.modules.includes(currentSystem)) {
      return <Navigate to={`/${currentSystem}`} replace />
    }
    if (context) {
      return <Navigate to="/selecionar-sistema" replace />
    }
    return <Navigate to="/selecionar-contexto" replace />
  }
  return <Outlet />
}
