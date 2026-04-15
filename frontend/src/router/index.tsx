import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { RequireAuth } from '../components/auth/RequireAuth'
import { RequireContext } from '../components/auth/RequireContext'
import { RequireModule } from '../components/auth/RequireModule'
import { RedirectIfAuthed } from '../components/auth/RedirectIfAuthed'

import { LoginPage } from '../pages/auth/LoginPage'
import { SystemSelectPage } from '../pages/auth/SystemSelectPage'
import { ContextSelectPage } from '../pages/auth/ContextSelectPage'
import { ModulePlaceholder } from '../pages/ModulePlaceholder'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { NotFoundPage } from '../pages/NotFoundPage'

// Shared
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
import { OpsAuditReportPage } from '../pages/ops/OpsAuditReportPage'
import { OpsOccurrencesReportPage } from '../pages/ops/OpsOccurrencesReportPage'
import { OpsActivityReportPage } from '../pages/ops/OpsActivityReportPage'
import { OpsSearchesPage } from '../pages/ops/OpsSearchesPage'

// ─── Router ──────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Raiz: sempre vai para /login; RedirectIfAuthed redireciona se já logado.
  { path: '/', element: <Navigate to="/login" replace /> },

  // Páginas públicas (não podem ser acessadas se já autenticado)
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/login', element: <LoginPage /> },
    ],
  },

  // Erros globais (acessíveis com ou sem auth)
  { path: '/403', element: <ForbiddenPage /> },
  { path: '/404', element: <NotFoundPage /> },

  // Área autenticada (sem exigir contexto) — seleção de contexto/sistema
  {
    element: <RequireAuth />,
    children: [
      { path: '/selecionar-contexto', element: <ContextSelectPage /> },

      // Seleção de sistema exige contexto selecionado
      {
        element: <RequireContext />,
        children: [
          { path: '/selecionar-sistema', element: <SystemSelectPage /> },

          // Todo o app protegido por auth + contexto
          {
            element: <AppShell />,
            children: [
              // Compartilhadas (ainda exigem contexto, mas não módulo específico)
              { path: '/usuarios',     element: <UsersPage /> },
              { path: '/notificacoes', element: <NotificationsPage /> },

              // CLN
              {
                element: <RequireModule moduleId="cln" />,
                children: [
                  { path: '/cln',                element: <GAHomePage /> },
                  { path: '/cln/pacientes',      element: <PatientListPage /> },
                  { path: '/cln/pacientes/:id',  element: <PatientDetailPage /> },
                  { path: '/cln/agendamentos',   element: <AppointmentListPage /> },
                  { path: '/cln/consultas',      element: <ConsultationListPage /> },
                  { path: '/cln/fila',           element: <QueuePage /> },
                  { path: '/cln/producao',       element: <ProductionPage /> },
                ],
              },

              // DGN
              {
                element: <RequireModule moduleId="dgn" />,
                children: [
                  { path: '/dgn',        element: <LabHomePage /> },
                  { path: '/dgn/exames', element: <ExamRequestListPage /> },
                  { path: '/dgn/laudos', element: <LabReportPage /> },
                ],
              },

              // HSP
              {
                element: <RequireModule moduleId="hsp" />,
                children: [
                  { path: '/hsp', element: <AIHHomePage /> },
                ],
              },

              // PLN
              {
                element: <RequireModule moduleId="pln" />,
                children: [
                  { path: '/pln', element: <ConvHomePage /> },
                ],
              },

              // FSC
              {
                element: <RequireModule moduleId="fsc" />,
                children: [
                  { path: '/fsc',                  element: <VISAHomePage /> },
                  { path: '/fsc/estabelecimentos', element: <EstablishmentListPage /> },
                ],
              },

              // OPS
              {
                element: <RequireModule moduleId="ops" />,
                children: [
                  { path: '/ops',                          element: <OpsHomePage /> },
                  { path: '/ops/usuarios',                 element: <OpsUserListPage /> },
                  { path: '/ops/usuarios/novo',            element: <OpsUserFormPage /> },
                  { path: '/ops/usuarios/:id',             element: <OpsUserViewPage /> },
                  { path: '/ops/usuarios/:id/editar',      element: <OpsUserFormPage /> },
                  { path: '/ops/logs',                     element: <OpsLogsPage /> },
                  { path: '/ops/relatorios',               element: <OpsReportsPage /> },
                  { path: '/ops/relatorios/acessos',       element: <OpsAccessReportPage /> },
                  { path: '/ops/relatorios/usuarios',      element: <OpsUsersReportPage /> },
                  { path: '/ops/relatorios/auditoria',     element: <OpsAuditReportPage /> },
                  { path: '/ops/relatorios/ocorrencias',   element: <OpsOccurrencesReportPage /> },
                  { path: '/ops/relatorios/atividade',     element: <OpsActivityReportPage /> },
                  { path: '/ops/pesquisas',                element: <OpsSearchesPage /> },
                ],
              },

              // Fallback para módulos válidos sem página específica.
              // RequireModule valida que o segmento é conhecido E que o usuário
              // tem acesso; caso contrário encaminha para /403.
              {
                element: <RequireModule />,
                children: [
                  { path: '/:module/*', element: <ModulePlaceholder /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // Qualquer outra rota não resolvida
  { path: '*', element: <NotFoundPage /> },
])
