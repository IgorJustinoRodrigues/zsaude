import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { SysShell } from '../components/layout/SysShell'
import { RequireAuth } from '../components/auth/RequireAuth'
import { RequireContext } from '../components/auth/RequireContext'
import { RequireModule } from '../components/auth/RequireModule'
import { RequireMaster } from '../components/auth/RequireMaster'
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
import { DgnHomePage } from '../pages/dgn/DgnHomePage'

// HSP – Hospitalar
// (telas serão adicionadas aqui)

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
import { OpsUserAccessPermsPage } from '../pages/ops/OpsUserAccessPermsPage'

// SYS (MASTER)
import { SysDashboardPage } from '../pages/sys/SysDashboardPage'
import { SysMunicipalityListPage } from '../pages/sys/SysMunicipalityListPage'
import { SysMunicipalityFormPage } from '../pages/sys/SysMunicipalityFormPage'
import { SysMunicipalityViewPage } from '../pages/sys/SysMunicipalityViewPage'
import { SysFacilityListPage } from '../pages/sys/SysFacilityListPage'
import { SysFacilityFormPage } from '../pages/sys/SysFacilityFormPage'
import { SysUserAdminPage } from '../pages/sys/SysUserAdminPage'
import { SysSettingsPage } from '../pages/sys/SysSettingsPage'
import { SysAuditPage } from '../pages/sys/SysAuditPage'
import { SysRoleListPage } from '../pages/sys/SysRoleListPage'
import { SysRoleDetailPage } from '../pages/sys/SysRoleDetailPage'
import { SysRoleFormPage } from '../pages/sys/SysRoleFormPage'

// Shared (com contexto): Perfis do município
import { RoleListPage } from '../pages/shared/RoleListPage'
import { RoleDetailPage } from '../pages/shared/RoleDetailPage'
import { RoleFormPage } from '../pages/shared/RoleFormPage'

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

      // ── Área MASTER — plataforma, não usa WorkContext ──────────────
      {
        element: <RequireMaster />,
        children: [
          {
            element: <SysShell />,
            children: [
              { path: '/sys',                       element: <SysDashboardPage /> },
              { path: '/sys/municipios',            element: <SysMunicipalityListPage /> },
              { path: '/sys/municipios/novo',       element: <SysMunicipalityFormPage /> },
              { path: '/sys/municipios/:id',        element: <SysMunicipalityViewPage /> },
              { path: '/sys/municipios/:id/editar', element: <SysMunicipalityFormPage /> },
              { path: '/sys/unidades',              element: <SysFacilityListPage /> },
              { path: '/sys/unidades/novo',         element: <SysFacilityFormPage /> },
              { path: '/sys/unidades/:id',          element: <SysFacilityFormPage /> },
              { path: '/sys/usuarios',              element: <SysUserAdminPage /> },
              { path: '/sys/perfis',                element: <SysRoleListPage /> },
              { path: '/sys/perfis/novo',           element: <SysRoleFormPage /> },
              { path: '/sys/perfis/:id',            element: <SysRoleDetailPage /> },
              { path: '/sys/configuracoes',         element: <SysSettingsPage /> },
              { path: '/sys/logs',                  element: <SysAuditPage /> },
            ],
          },
        ],
      },

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
              { path: '/usuarios',           element: <UsersPage /> },
              { path: '/notificacoes',       element: <NotificationsPage /> },
              { path: '/shared/perfis',      element: <RoleListPage /> },
              { path: '/shared/perfis/novo', element: <RoleFormPage /> },
              { path: '/shared/perfis/:id',  element: <RoleDetailPage /> },

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

              // DGN — Diagnóstico
              {
                element: <RequireModule moduleId="dgn" />,
                children: [
                  { path: '/dgn', element: <DgnHomePage /> },
                ],
              },

              // HSP — Hospitalar (telas ainda não criadas)
              {
                element: <RequireModule moduleId="hsp" />,
                children: [],
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
                  { path: '/ops/usuarios/:userId/acessos/:accessId/permissoes', element: <OpsUserAccessPermsPage /> },
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
