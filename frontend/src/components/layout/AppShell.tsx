import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUIStore } from '../../store/uiStore'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'
import { Toaster } from '../ui/Toaster'

const VALID_MODULES: SystemId[] = ['cln', 'dgn', 'hsp', 'pln', 'fsc', 'ops']

export function AppShell() {
  // Os guards de rota (RequireAuth, RequireContext, RequireModule) já garantem
  // que usuário/contexto/módulo existem. O shell apenas renderiza o layout.
  const { sidebarCollapsed } = useUIStore()
  const { pathname } = useLocation()
  const segment = pathname.split('/')[1] as SystemId
  const currentModule = VALID_MODULES.includes(segment) ? segment : null

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar module={currentModule} />
      <div
        className={cn(
          'flex flex-col flex-1 min-w-0 transition-all duration-200',
          'ml-0',
          'md:ml-16',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        <TopBar module={currentModule} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  )
}
