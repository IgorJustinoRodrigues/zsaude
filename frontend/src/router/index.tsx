import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { SysShell } from '../components/layout/SysShell'
import { RequireAuth } from '../components/auth/RequireAuth'
import { RequireContext } from '../components/auth/RequireContext'
import { RequireModule } from '../components/auth/RequireModule'
import { RequireMaster } from '../components/auth/RequireMaster'
import { RedirectIfAuthed } from '../components/auth/RedirectIfAuthed'

import { LoginPage } from '../pages/auth/LoginPage'
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '../pages/auth/VerifyEmailPage'
import { SystemSelectPage } from '../pages/auth/SystemSelectPage'
import { ContextSelectPage } from '../pages/auth/ContextSelectPage'
import { ModulePlaceholder } from '../pages/ModulePlaceholder'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { NotFoundPage } from '../pages/NotFoundPage'

// Shared
import { UsersPage } from '../pages/shared/UsersPage'
import { NotificationsPage } from '../pages/shared/NotificationsPage'
import { MinhaContaPage } from '../pages/shared/MinhaContaPage'

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
import { HspHomePage } from '../pages/hsp/HspHomePage'
import { HspPatientFormPage } from '../pages/hsp/HspPatientFormPage'
import { HspPatientQuickFormPage } from '../pages/hsp/HspPatientQuickFormPage'
import { HspPatientSearchPage } from '../pages/hsp/HspPatientSearchPage'
import { HspPatientDetailPage } from '../pages/hsp/HspPatientDetailPage'

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
import { OpsImportsPage } from '../pages/ops/OpsImportsPage'
import { OpsImportCnesPage } from '../pages/ops/OpsImportCnesPage'
import { OpsCboSearchPage } from '../pages/ops/OpsCboSearchPage'
import { OpsCidSearchPage } from '../pages/ops/OpsCidSearchPage'
import { OpsProcedureSearchPage } from '../pages/ops/OpsProcedureSearchPage'
import { OpsCboProcedureSearchPage } from '../pages/ops/OpsCboProcedureSearchPage'
import { OpsCidProcedureSearchPage } from '../pages/ops/OpsCidProcedureSearchPage'
import { OpsServicoSearchPage } from '../pages/ops/OpsServicoSearchPage'
import { OpsHabilitacaoSearchPage } from '../pages/ops/OpsHabilitacaoSearchPage'
import { OpsCompatibilidadeSearchPage } from '../pages/ops/OpsCompatibilidadeSearchPage'
import { OpsFormaOrgSearchPage } from '../pages/ops/OpsFormaOrgSearchPage'

// REC – Recepção
import { RecHomePage } from '../pages/rec/RecHomePage'
import { RecQueuePage } from '../pages/rec/RecQueuePage'
import { RecTotemPage } from '../pages/rec/RecTotemPage'
import { RecPainelPage } from '../pages/rec/RecPainelPage'

// SYS (MASTER)
import { SysDashboardPage } from '../pages/sys/SysDashboardPage'
import { SysMunicipalityListPage } from '../pages/sys/SysMunicipalityListPage'
import { SysMunicipalityFormPage } from '../pages/sys/SysMunicipalityFormPage'
import { SysMunicipalityViewPage } from '../pages/sys/SysMunicipalityViewPage'
import { SysFacilityListPage } from '../pages/sys/SysFacilityListPage'
import { SysFacilityFormPage } from '../pages/sys/SysFacilityFormPage'
import { SysProfessionalsPage } from '../pages/sys/SysProfessionalsPage'
import { SysUserAdminPage } from '../pages/sys/SysUserAdminPage'
import { SysSettingsPage } from '../pages/sys/SysSettingsPage'
import { SysEmailTemplatesPage } from '../pages/sys/SysEmailTemplatesPage'
import { SysEmailCredentialsPage } from '../pages/sys/SysEmailCredentialsPage'
import { SysNotificationsPage } from '../pages/sys/SysNotificationsPage'
import { SysNotificationDetailPage } from '../pages/sys/SysNotificationDetailPage'
import { SysAuditPage } from '../pages/sys/SysAuditPage'
import { SysRoleListPage } from '../pages/sys/SysRoleListPage'
import { SysRoleDetailPage } from '../pages/sys/SysRoleDetailPage'
import { SysRoleFormPage } from '../pages/sys/SysRoleFormPage'
import { SysImportsPage } from '../pages/sys/SysImportsPage'
import { SysImportSigtapPage } from '../pages/sys/SysImportSigtapPage'
import { SysImportCnesPage } from '../pages/sys/SysImportCnesPage'
import { SysReferencePage } from '../pages/sys/SysReferencePage'
import { SysCadsusPage } from '../pages/sys/SysCadsusPage'
import { SysAiPage } from '../pages/sys/SysAiPage'
import { SysMunicipalityBrandingPage, SysFacilityBrandingPage } from '../pages/sys/SysBrandingPage'

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
      { path: '/login',           element: <LoginPage /> },
      { path: '/esqueci-senha',   element: <ForgotPasswordPage /> },
      { path: '/redefinir-senha', element: <ResetPasswordPage /> },
    ],
  },

  // Acessível com ou sem auth: a própria página cuida de deslogar se
  // o usuário já tiver sessão (evita usar token de verificação de
  // alguém diferente do logado).
  { path: '/verificar-email', element: <VerifyEmailPage /> },

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
              { path: '/sys/municipios',                  element: <SysMunicipalityListPage /> },
              { path: '/sys/municipios/novo',             element: <SysMunicipalityFormPage /> },
              { path: '/sys/municipios/:id',              element: <SysMunicipalityViewPage /> },
              { path: '/sys/municipios/:id/editar',       element: <SysMunicipalityFormPage /> },
              { path: '/sys/municipios/:id/personalizar', element: <SysMunicipalityBrandingPage /> },
              { path: '/sys/unidades',                    element: <SysFacilityListPage /> },
              { path: '/sys/unidades/novo',               element: <SysFacilityFormPage /> },
              { path: '/sys/unidades/:id',                element: <SysFacilityFormPage /> },
              { path: '/sys/unidades/:id/personalizar',   element: <SysFacilityBrandingPage /> },
              { path: '/sys/profissionais',               element: <SysProfessionalsPage /> },
              { path: '/sys/usuarios',              element: <SysUserAdminPage /> },
              { path: '/sys/usuarios/novo',         element: <OpsUserFormPage /> },
              { path: '/sys/usuarios/:id',          element: <OpsUserViewPage /> },
              { path: '/sys/usuarios/:id/editar',   element: <OpsUserFormPage /> },
              { path: '/sys/perfis',                element: <SysRoleListPage /> },
              { path: '/sys/perfis/novo',           element: <SysRoleFormPage /> },
              { path: '/sys/perfis/:id',            element: <SysRoleDetailPage /> },
              { path: '/sys/importacoes',           element: <SysImportsPage /> },
              { path: '/sys/importacoes/sigtap',    element: <SysImportSigtapPage /> },
              { path: '/sys/importacoes/cnes',      element: <SysImportCnesPage /> },
              { path: '/sys/dados-referencia',      element: <SysReferencePage /> },
              { path: '/sys/cadsus',                element: <SysCadsusPage /> },
              { path: '/sys/ia',                    element: <SysAiPage /> },
              { path: '/sys/configuracoes',         element: <SysSettingsPage /> },
              { path: '/sys/templates-email',       element: <SysEmailTemplatesPage /> },
              { path: '/sys/credenciais-email',     element: <SysEmailCredentialsPage /> },
              { path: '/sys/notificacoes',          element: <SysNotificationsPage /> },
              { path: '/sys/notificacoes/:id',      element: <SysNotificationDetailPage /> },
              { path: '/sys/logs',                  element: <SysAuditPage /> },
              { path: '/sys/minha-conta',           element: <MinhaContaPage /> },
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
              { path: '/minha-conta',        element: <MinhaContaPage /> },
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

              // HSP — Hospitalar
              {
                element: <RequireModule moduleId="hsp" />,
                children: [
                  { path: '/hsp',                          element: <HspHomePage /> },
                  // /hsp/pacientes redireciona para a busca (listagem foi removida).
                  { path: '/hsp/pacientes',                element: <Navigate to="/hsp/pacientes/buscar" replace /> },
                  { path: '/hsp/pacientes/buscar',         element: <HspPatientSearchPage /> },
                  { path: '/hsp/pacientes/novo',           element: <HspPatientQuickFormPage /> },
                  { path: '/hsp/pacientes/:id',            element: <HspPatientDetailPage /> },
                  { path: '/hsp/pacientes/:id/editar',     element: <HspPatientFormPage /> },
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
                  { path: '/ops/usuarios/:userId/acessos/:accessId/permissoes', element: <OpsUserAccessPermsPage /> },
                  { path: '/ops/importacoes',        element: <OpsImportsPage /> },
                  { path: '/ops/importacoes/cnes',   element: <OpsImportCnesPage /> },
                  { path: '/ops/logs',                     element: <OpsLogsPage /> },
                  { path: '/ops/relatorios',               element: <OpsReportsPage /> },
                  { path: '/ops/relatorios/acessos',       element: <OpsAccessReportPage /> },
                  { path: '/ops/relatorios/usuarios',      element: <OpsUsersReportPage /> },
                  { path: '/ops/relatorios/auditoria',     element: <OpsAuditReportPage /> },
                  { path: '/ops/relatorios/ocorrencias',   element: <OpsOccurrencesReportPage /> },
                  { path: '/ops/relatorios/atividade',     element: <OpsActivityReportPage /> },
                  { path: '/ops/pesquisas',                element: <OpsSearchesPage /> },
                  { path: '/ops/pesquisas/cbo',            element: <OpsCboSearchPage /> },
                  { path: '/ops/pesquisas/cid',            element: <OpsCidSearchPage /> },
                  { path: '/ops/pesquisas/procedimentos',  element: <OpsProcedureSearchPage /> },
                  { path: '/ops/pesquisas/cbo-procedimentos', element: <OpsCboProcedureSearchPage /> },
                  { path: '/ops/pesquisas/cid-procedimentos', element: <OpsCidProcedureSearchPage /> },
                  { path: '/ops/pesquisas/servicos',          element: <OpsServicoSearchPage /> },
                  { path: '/ops/pesquisas/habilitacoes',      element: <OpsHabilitacaoSearchPage /> },
                  { path: '/ops/pesquisas/compatibilidades',  element: <OpsCompatibilidadeSearchPage /> },
                  { path: '/ops/pesquisas/formas-organizacao',element: <OpsFormaOrgSearchPage /> },
                ],
              },

              // REC — Recepção
              {
                element: <RequireModule moduleId="rec" />,
                children: [
                  { path: '/rec',            element: <RecHomePage /> },
                  { path: '/rec/atendimento', element: <RecQueuePage /> },
                  { path: '/rec/totem',  element: <RecTotemPage /> },
                  { path: '/rec/painel', element: <RecPainelPage /> },
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
