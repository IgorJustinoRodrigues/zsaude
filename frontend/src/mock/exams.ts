import type { ExamRequest } from '../types'

export const mockExamRequests: ExamRequest[] = [
  {
    id: 'e1', patientId: 'p1', patientName: 'Ana Beatriz Ferreira da Silva',
    professionalId: 'pr1', professionalName: 'Dr. Ricardo Alves Monteiro',
    unitId: 'u1', unitName: 'UBS Centro',
    requestDate: '2026-04-10', collectionDate: '2026-04-11', releaseDate: '2026-04-12',
    status: 'Resultado Liberado', urgency: false,
    exams: [
      { id: 'ei1', code: 'hemograma', name: 'Hemograma Completo', referenceValue: 'Eritrócitos M: 4,5-5,5 / F: 3,9-5,0 10⁶/µL', unit: '10⁶/µL', result: '4.8', status: 'Resultado Liberado', abnormal: false },
      { id: 'ei2', code: 'glicose', name: 'Glicose em Jejum', referenceValue: '70-99 mg/dL', unit: 'mg/dL', result: '112', status: 'Resultado Liberado', abnormal: true },
      { id: 'ei3', code: 'colesterol-total', name: 'Colesterol Total', referenceValue: '< 200 mg/dL', unit: 'mg/dL', result: '195', status: 'Resultado Liberado', abnormal: false },
    ],
    notes: 'Paciente com histórico de DM2'
  },
  {
    id: 'e2', patientId: 'p2', patientName: 'Carlos Eduardo Souza Mendes',
    professionalId: 'pr4', professionalName: 'Dr. Marcos Vinicius Teixeira',
    unitId: 'u3', unitName: 'HMU',
    requestDate: '2026-04-12', collectionDate: '2026-04-13',
    status: 'Em Análise', urgency: true,
    exams: [
      { id: 'ei4', code: 'troponina', name: 'Troponina I', referenceValue: '< 0,04 ng/mL', unit: 'ng/mL', status: 'Em Análise' },
      { id: 'ei5', code: 'ck-mb', name: 'CK-MB', referenceValue: '< 25 U/L', unit: 'U/L', status: 'Em Análise' },
      { id: 'ei6', code: 'bnp', name: 'BNP', referenceValue: '< 100 pg/mL', unit: 'pg/mL', status: 'Em Análise' },
    ],
    notes: 'URGENTE - dor precordial há 4h'
  },
  {
    id: 'e3', patientId: 'p3', patientName: 'Fernanda Cristina Lima Ramos',
    professionalId: 'pr5', professionalName: 'Dra. Ana Flávia Cunha Lopes',
    unitId: 'u1', unitName: 'UBS Centro',
    requestDate: '2026-04-08',
    status: 'Solicitado', urgency: false,
    exams: [
      { id: 'ei7', code: 'papanicolau', name: 'Papanicolau', referenceValue: 'Negativo para lesão intraepitelial', unit: '', status: 'Solicitado' },
      { id: 'ei8', code: 'beta-hcg', name: 'Beta-HCG Quantitativo', referenceValue: 'Não grávida: < 5 mUI/mL', unit: 'mUI/mL', status: 'Solicitado' },
    ]
  },
  {
    id: 'e4', patientId: 'p5', patientName: 'Mariana Oliveira Costa Barbosa',
    professionalId: 'pr2', professionalName: 'Dra. Priscila Borges Azevedo',
    unitId: 'u1', unitName: 'UBS Centro',
    requestDate: '2026-04-09', collectionDate: '2026-04-10', releaseDate: '2026-04-11',
    status: 'Resultado Liberado', urgency: false,
    exams: [
      { id: 'ei9', code: 'tsh', name: 'TSH', referenceValue: '0,4-4,0 µUI/mL', unit: 'µUI/mL', result: '2.1', status: 'Resultado Liberado', abnormal: false },
      { id: 'ei10', code: 't4-livre', name: 'T4 Livre', referenceValue: '0,8-1,9 ng/dL', unit: 'ng/dL', result: '1.2', status: 'Resultado Liberado', abnormal: false },
    ]
  },
  {
    id: 'e5', patientId: 'p10', patientName: 'Antônio Carlos Pereira da Cruz',
    professionalId: 'pr1', professionalName: 'Dr. Ricardo Alves Monteiro',
    unitId: 'u1', unitName: 'UBS Centro',
    requestDate: '2026-04-13', collectionDate: '2026-04-14',
    status: 'Coletado', urgency: false,
    exams: [
      { id: 'ei11', code: 'creatinina', name: 'Creatinina', referenceValue: 'M: 0,7-1,3 / F: 0,5-1,0 mg/dL', unit: 'mg/dL', status: 'Coletado' },
      { id: 'ei12', code: 'ureia', name: 'Ureia', referenceValue: '10-45 mg/dL', unit: 'mg/dL', status: 'Coletado' },
      { id: 'ei13', code: 'acido-urico', name: 'Ácido Úrico', referenceValue: 'M: 3,4-7,0 / F: 2,4-5,7 mg/dL', unit: 'mg/dL', status: 'Coletado' },
    ],
    notes: 'Paciente hipertenso, acompanhamento renal'
  },
]

export const getExamRequestById = (id: string) => mockExamRequests.find(e => e.id === id)
export const getExamsByPatient = (patientId: string) => mockExamRequests.filter(e => e.patientId === patientId)
