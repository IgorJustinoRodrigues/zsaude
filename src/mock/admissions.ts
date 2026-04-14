import type { Admission } from '../types'

export const mockAdmissions: Admission[] = [
  { id: 'adm1', aihNumber: '3100000001', patientId: 'p2', patientName: 'Carlos Eduardo Souza Mendes', professionalId: 'pr4', unitId: 'u3', admissionDate: '2026-04-12', diagnosis: 'Síndrome Coronariana Aguda', cidCode: 'I21', procedure: 'Angioplastia coronariana percutânea', status: 'Internado', bed: '204A', ward: 'UTI Cardiológica' },
  { id: 'adm2', aihNumber: '3100000002', patientId: 'p6', patientName: 'Paulo Henrique Ribeiro Gomes', professionalId: 'pr10', unitId: 'u3', admissionDate: '2026-04-10', dischargeDate: '2026-04-13', diagnosis: 'Acidente Vascular Cerebral Isquêmico', cidCode: 'I63', procedure: 'Internação clínica neurológica', status: 'Alta', ward: 'Neurologia' },
  { id: 'adm3', aihNumber: '3100000003', patientId: 'p4', patientName: 'José Roberto Almeida Pinto', professionalId: 'pr6', unitId: 'u3', admissionDate: '2026-04-13', diagnosis: 'Fratura do colo do fêmur', cidCode: 'S72.0', procedure: 'Osteossíntese de fêmur', status: 'Autorizada', ward: 'Ortopedia' },
  { id: 'adm4', aihNumber: '3100000004', patientId: 'p10', patientName: 'Antônio Carlos Pereira da Cruz', professionalId: 'pr1', unitId: 'u3', admissionDate: '2026-04-14', diagnosis: 'Insuficiência cardíaca congestiva descompensada', cidCode: 'I50', procedure: 'Internação clínica cardiológica', status: 'Solicitada' },
  { id: 'adm5', aihNumber: '3100000005', patientId: 'p9', patientName: 'Juliana Aparecida Martins Freitas', professionalId: 'pr5', unitId: 'u3', admissionDate: '2026-04-01', dischargeDate: '2026-04-07', diagnosis: 'Parto normal', cidCode: 'O80', procedure: 'Parto normal sem complicações', status: 'Alta', bed: '105B', ward: 'Maternidade' },
]
