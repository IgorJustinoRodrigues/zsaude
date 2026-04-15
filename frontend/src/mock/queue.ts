import type { QueueEntry } from '../types'

export const mockQueue: QueueEntry[] = [
  { id: 'q1', ticket: 'A001', patientId: 'p1', patientName: 'Ana Beatriz Ferreira da Silva', patientAge: 41, sector: 'Clínica Médica', arrivalTime: '07:42', status: 'Atendido', triageRisk: 'Pouco Urgente', priority: false, waitMinutes: 0 },
  { id: 'q2', ticket: 'A002', patientId: 'p2', patientName: 'Carlos Eduardo Souza Mendes', patientAge: 54, sector: 'Cardiologia', arrivalTime: '07:55', status: 'Em Atendimento', triageRisk: 'Urgente', priority: true, waitMinutes: 0 },
  { id: 'q3', ticket: 'A003', patientId: 'p3', patientName: 'Fernanda Cristina Lima Ramos', patientAge: 36, sector: 'Ginecologia', arrivalTime: '08:10', status: 'Em Triagem', triageRisk: undefined, priority: false, waitMinutes: 18 },
  { id: 'q4', ticket: 'A004', patientId: 'p4', patientName: 'José Roberto Almeida Pinto', patientAge: 61, sector: 'Ortopedia', arrivalTime: '08:15', status: 'Aguardando', triageRisk: 'Pouco Urgente', priority: false, waitMinutes: 35 },
  { id: 'q5', ticket: 'A005', patientId: 'p5', patientName: 'Mariana Oliveira Costa Barbosa', patientAge: 28, sector: 'Pediatria', arrivalTime: '08:22', status: 'Aguardando', triageRisk: undefined, priority: false, waitMinutes: 28 },
  { id: 'q6', ticket: 'A006', patientId: 'p6', patientName: 'Paulo Henrique Ribeiro Gomes', patientAge: 68, sector: 'Neurologia', arrivalTime: '08:30', status: 'Aguardando', triageRisk: 'Não Urgente', priority: true, waitMinutes: 20 },
  { id: 'q7', ticket: 'A007', patientId: 'p7', patientName: 'Silvia Maria Torres Andrade', patientAge: 25, sector: 'Clínica Médica', arrivalTime: '08:45', status: 'Aguardando', triageRisk: undefined, priority: false, waitMinutes: 15 },
  { id: 'q8', ticket: 'A008', patientId: 'p8', patientName: 'Rafael Augusto Carvalho Nunes', patientAge: 46, sector: 'Cardiologia', arrivalTime: '08:50', status: 'Aguardando', triageRisk: undefined, priority: false, waitMinutes: 12 },
  { id: 'q9', ticket: 'B001', patientId: 'p9', patientName: 'Juliana Aparecida Martins Freitas', patientAge: 51, sector: 'Enfermagem', arrivalTime: '08:55', status: 'Aguardando', triageRisk: 'Muito Urgente', priority: true, waitMinutes: 7 },
  { id: 'q10', ticket: 'B002', patientId: 'p10', patientName: 'Antônio Carlos Pereira da Cruz', patientAge: 81, sector: 'Clínica Médica', arrivalTime: '09:00', status: 'Aguardando', triageRisk: undefined, priority: true, waitMinutes: 2 },
  { id: 'q11', ticket: 'B003', patientId: 'p11', patientName: 'Débora Letícia Campos Vieira', patientAge: 33, sector: 'Psicologia', arrivalTime: '09:05', status: 'Aguardando', triageRisk: undefined, priority: false, waitMinutes: 0 },
  { id: 'q12', ticket: 'B004', patientId: 'p12', patientName: 'Luís Fernando Nascimento Xavier', patientAge: 39, sector: 'Ortopedia', arrivalTime: '09:10', status: 'Aguardando', triageRisk: undefined, priority: false, waitMinutes: 0 },
]

export const getQueueBySector = (sector: string) => mockQueue.filter(q => q.sector === sector)
export const getQueueStats = () => ({
  total: mockQueue.length,
  waiting: mockQueue.filter(q => q.status === 'Aguardando').length,
  inProgress: mockQueue.filter(q => q.status === 'Em Atendimento' || q.status === 'Em Triagem').length,
  attended: mockQueue.filter(q => q.status === 'Atendido').length,
})
