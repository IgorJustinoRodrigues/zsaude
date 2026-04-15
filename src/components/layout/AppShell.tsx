import { Outlet, useLocation, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUIStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'

const VALID_MODULES: SystemId[] = ['cln', 'dgn', 'hsp', 'pln', 'fsc', 'ops']

export function AppShell() {
  const { isAuthenticated } = useAuthStore()
  const { sidebarCollapsed } = useUIStore()
  const { pathname } = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  const segment = pathname.split('/')[1] as SystemId
  const currentModule = VALID_MODULES.includes(segment) ? segment : null

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar module={currentModule} />
      <div
        className={cn(
          'flex flex-col flex-1 min-w-0 transition-all duration-200',
          // mobile: sem margem (sidebar é overlay)
          'ml-0',
          // tablet (md): sidebar sempre icon-only (w-16)
          'md:ml-16',
          // desktop (lg): segue preferência do usuário
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        <TopBar module={currentModule} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
