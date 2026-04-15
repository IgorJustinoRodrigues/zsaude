import type { Notification } from '../types'

const d = (iso: string): string => iso  // helper de legibilidade

export const mockNotifications: Notification[] = [
  // ── Não lidas ────────────────────────────────────────────────────────────────
  { id: 'n2',  type: 'warning', title: 'Fila acima do limite',                  message: 'Setor Clínica Médica com 12 pacientes aguardando há mais de 45 min.',                             read: false, createdAt: d('2026-04-14T09:05:00') },
  { id: 'n3',  type: 'warning', title: 'Alvará prestes a vencer',               message: 'Estabelecimento Academia BodyFit – alvará vence em 16 dias.',                                     read: false, createdAt: d('2026-04-13T16:00:00') },
  { id: 'n4',  type: 'info',    title: 'Novo usuário cadastrado',               message: 'Fernanda Lima foi cadastrada no módulo Clínica pela unidade UBS Sul.',                            read: false, createdAt: d('2026-04-14T07:45:00') },
  { id: 'n5',  type: 'warning', title: 'Leito indisponível – HMU',              message: 'Unidade hospitalar sem leitos disponíveis na ala de cirurgia geral.',                             read: false, createdAt: d('2026-04-14T06:30:00') },
  // ── Lidas ────────────────────────────────────────────────────────────────────
  { id: 'n7',  type: 'info',    title: 'Manutenção programada',                 message: 'O sistema entrará em manutenção hoje às 22h por aproximadamente 1 hora.',                         read: true,  createdAt: d('2026-04-14T07:00:00') },
  { id: 'n8',  type: 'success', title: 'Backup concluído',                      message: 'Backup diário dos dados realizado com sucesso às 03:00.',                                          read: true,  createdAt: d('2026-04-14T03:00:00') },
  { id: 'n9',  type: 'error',   title: 'Falha na integração RNDS',              message: 'Timeout na comunicação com a RNDS. Tentativas de reenvio em andamento.',                         read: true,  createdAt: d('2026-04-13T22:10:00') },
  { id: 'n10', type: 'success', title: 'Atualização aplicada',                  message: 'Sistema atualizado para a versão 2.4.1 com melhorias de performance.',                            read: true,  createdAt: d('2026-04-13T18:00:00') },
  { id: 'n11', type: 'info',    title: 'Relatório mensal disponível',           message: 'Relatório de produção de março/2026 já está disponível para download.',                           read: true,  createdAt: d('2026-04-13T08:00:00') },
  { id: 'n12', type: 'warning', title: 'Certificado SSL vencendo',              message: 'O certificado SSL do servidor expira em 30 dias. Renovação necessária.',                          read: true,  createdAt: d('2026-04-12T10:00:00') },
]
