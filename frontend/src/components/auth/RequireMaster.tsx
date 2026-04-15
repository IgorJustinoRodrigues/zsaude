import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/** Guard: só usuários com level=master acessam. */
export function RequireMaster() {
  const { user, hydrated } = useAuthStore()
  if (!hydrated) return null  // RequireAuth pai mostra splash
  if (!user || user.level !== 'master') {
    return <Navigate to="/403" replace />
  }
  return <Outlet />
}
