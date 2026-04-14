import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { LoginPage } from '../pages/auth/LoginPage'
import { SystemSelectPage } from '../pages/auth/SystemSelectPage'
import { ModulePlaceholder } from '../pages/ModulePlaceholder'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/selecionar-sistema', element: <SystemSelectPage /> },

  {
    element: <AppShell />,
    children: [
      { path: '/:module', element: <ModulePlaceholder /> },
      { path: '/:module/*', element: <ModulePlaceholder /> },
    ],
  },
])
