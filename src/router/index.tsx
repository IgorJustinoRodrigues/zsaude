import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { LoginPage } from '../pages/auth/LoginPage'
import { SystemSelectPage } from '../pages/auth/SystemSelectPage'
import { ModulePlaceholder } from '../pages/ModulePlaceholder'

// Shared
import { ContextSelectPage } from '../pages/auth/ContextSelectPage'
import { UsersPage } from '../pages/shared/UsersPage'
import { NotificationsPage } from '../pages/shared/NotificationsPage'

// CLN – Clínica
import { GAHomePage } from '../pages/cln/GAHomePage'
import { PatientListPage } from '../pages/cln/PatientListPage'
import { PatientDetailPage } from '../pages/cln/PatientDetailPage'
import { AppointmentListPage } from '../pages/cln/AppointmentListPage'
import { ConsultationListPage } from '../pages/cln/ConsultationListPage'
import { QueuePage } from '../pages/cln/QueuePage'
import { ProductionPage } from '../pages/cln/ProductionPage'

// DGN – Diagnóstico
import { LabHomePage } from '../pages/dgn/LabHomePage'
import { ExamRequestListPage } from '../pages/dgn/ExamRequestListPage'
import { LabReportPage } from '../pages/dgn/LabReportPage'

// HSP – Hospitalar
import { AIHHomePage } from '../pages/hsp/AIHHomePage'

// PLN – Planos
import { ConvHomePage } from '../pages/pln/ConvHomePage'

// FSC – Fiscal
import { VISAHomePage } from '../pages/fsc/VISAHomePage'
import { EstablishmentListPage } from '../pages/fsc/EstablishmentListPage'

// OPS – Operações
import { OpsHomePage } from '../pages/ops/OpsHomePage'
import { OpsUserListPage } from '../pages/ops/OpsUserListPage'
import { OpsUserViewPage } from '../pages/ops/OpsUserViewPage'
import { OpsUserFormPage } from '../pages/ops/OpsUserFormPage'
import { OpsLogsPage } from '../pages/ops/OpsLogsPage'
import { OpsReportsPage } from '../pages/ops/OpsReportsPage'
import { OpsAccessReportPage } from '../pages/ops/OpsAccessReportPage'
import { OpsUsersReportPage } from '../pages/ops/OpsUsersReportPage'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/selecionar-contexto', element: <ContextSelectPage /> },
  { path: '/selecionar-sistema', element: <SystemSelectPage /> },

  {
    element: <AppShell />,
    children: [
      // Shared
      { path: '/usuarios',      element: <UsersPage /> },
      { path: '/notificacoes',  element: <NotificationsPage /> },

      // CLN – Clínica
      { path: '/cln',                        element: <GAHomePage /> },
      { path: '/cln/pacientes',              element: <PatientListPage /> },
      { path: '/cln/pacientes/:id',          element: <PatientDetailPage /> },
      { path: '/cln/agendamentos',           element: <AppointmentListPage /> },
      { path: '/cln/consultas',              element: <ConsultationListPage /> },
      { path: '/cln/fila',                   element: <QueuePage /> },
      { path: '/cln/producao',               element: <ProductionPage /> },

      // DGN – Diagnóstico
      { path: '/dgn',                        element: <LabHomePage /> },
      { path: '/dgn/exames',                 element: <ExamRequestListPage /> },
      { path: '/dgn/laudos',                 element: <LabReportPage /> },

      // HSP – Hospitalar
      { path: '/hsp',                        element: <AIHHomePage /> },

      // PLN – Planos
      { path: '/pln',                        element: <ConvHomePage /> },

      // FSC – Fiscal
      { path: '/fsc',                        element: <VISAHomePage /> },
      { path: '/fsc/estabelecimentos',       element: <EstablishmentListPage /> },

      // OPS – Operações
      { path: '/ops',                  element: <OpsHomePage /> },
      { path: '/ops/usuarios',               element: <OpsUserListPage /> },
      { path: '/ops/usuarios/novo',          element: <OpsUserFormPage /> },
      { path: '/ops/usuarios/:id',           element: <OpsUserViewPage /> },
      { path: '/ops/usuarios/:id/editar',    element: <OpsUserFormPage /> },
      { path: '/ops/logs',                   element: <OpsLogsPage /> },
      { path: '/ops/relatorios',             element: <OpsReportsPage /> },
      { path: '/ops/relatorios/acessos',     element: <OpsAccessReportPage /> },
      { path: '/ops/relatorios/usuarios',    element: <OpsUsersReportPage /> },

      // Fallback
      { path: '/:module/*', element: <ModulePlaceholder /> },
    ],
  },
])
