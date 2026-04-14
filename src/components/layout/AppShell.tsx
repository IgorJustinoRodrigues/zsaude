import { Outlet, useParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useUIStore } from '../../store/uiStore'
import { cn } from '../../lib/utils'
import type { SystemId } from '../../types'

const VALID_MODULES: SystemId[] = ['ga', 'lab', 'aih', 'conv', 'visa', 'adm']

export function AppShell() {
  const { sidebarCollapsed } = useUIStore()
  const { module } = useParams<{ module: string }>()
  const currentModule = VALID_MODULES.includes(module as SystemId) ? (module as SystemId) : null

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
