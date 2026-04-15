import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { LoginPage } from '../pages/auth/LoginPage'
import { SystemSelectPage } from '../pages/auth/SystemSelectPage'
import { ModulePlaceholder } from '../pages/ModulePlaceholder'
import { UsersPage } from '../pages/shared/UsersPage'
import { NotificationsPage } from '../pages/shared/NotificationsPage'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/selecionar-sistema', element: <SystemSelectPage /> },

  {
    element: <AppShell />,
    children: [
      { path: '/usuarios', element: <UsersPage /> },
      { path: '/notificacoes', element: <NotificationsPage /> },
      { path: '/:module', element: <ModulePlaceholder /> },
      { path: '/:module/*', element: <ModulePlaceholder /> },
    ],
  },
])
