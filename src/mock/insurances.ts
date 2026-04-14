import type { Insurance } from '../types'

export const mockInsurances: Insurance[] = [
  { id: 'ins1', name: 'SUS – Sistema Único de Saúde', code: 'SUS001', type: 'SUS', status: 'Ativo', validFrom: '2020-01-01', proceduresCount: 4820, beneficiariesCount: 0 },
  { id: 'ins2', name: 'IPASGO – Instituto de Assistência dos Servidores Públicos', code: 'IPASGO001', type: 'IPASGO', status: 'Ativo', validFrom: '2021-03-01', proceduresCount: 1240, beneficiariesCount: 145200 },
  { id: 'ins3', name: 'Unimed Goiânia', code: 'UNIMED001', type: 'Unimed', status: 'Ativo', validFrom: '2022-01-15', validTo: '2026-12-31', proceduresCount: 890, beneficiariesCount: 78300 },
  { id: 'ins4', name: 'Bradesco Saúde', code: 'BRAD001', type: 'Bradesco', status: 'Suspenso', validFrom: '2019-06-01', proceduresCount: 650, beneficiariesCount: 22100 },
  { id: 'ins5', name: 'Atendimento Particular', code: 'PART001', type: 'Particular', status: 'Ativo', validFrom: '2020-01-01', proceduresCount: 0, beneficiariesCount: 0 },
]
