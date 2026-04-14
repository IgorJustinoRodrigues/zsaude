import type { Notification } from '../types'

export const mockNotifications: Notification[] = [
  { id: 'n1', type: 'warning', title: 'Fila acima do limite', message: 'Setor Clínica Médica com 12 pacientes aguardando há mais de 45 min.', read: false, createdAt: '2026-04-14T09:05:00' },
  { id: 'n2', type: 'error', title: 'Resultado crítico – Carlos Mendes', message: 'Resultado de Troponina I acima do valor crítico. Verificar imediatamente.', read: false, createdAt: '2026-04-14T08:55:00' },
  { id: 'n3', type: 'success', title: 'Laudo liberado', message: 'Laudo do pedido #e1 – Ana Beatriz foi liberado com sucesso.', read: true, createdAt: '2026-04-14T08:30:00' },
  { id: 'n4', type: 'info', title: 'Manutenção programada', message: 'O sistema entrará em manutenção hoje às 22h por aprox. 1 hora.', read: true, createdAt: '2026-04-14T07:00:00' },
  { id: 'n5', type: 'warning', title: 'Alvará prestes a vencer', message: 'Estabelecimento Academia BodyFit – alvará vence em 16 dias.', read: false, createdAt: '2026-04-13T16:00:00' },
]
