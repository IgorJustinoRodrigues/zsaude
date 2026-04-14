import type { Unit } from '../types'

export const mockUnits: Unit[] = [
  { id: 'u1', name: 'UBS Centro de Saúde Municipal', shortName: 'UBS Centro', cnes: '2337344', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Rua 9 nº 100, Centro', phone: '(62) 3524-1200', type: 'UBS', active: true },
  { id: 'u2', name: 'UPA 24h Norte', shortName: 'UPA Norte', cnes: '2337352', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Av. Anhanguera nº 4500, Setor Norte', phone: '(62) 3524-1300', type: 'UPA', active: true },
  { id: 'u3', name: 'Hospital Municipal de Urgências', shortName: 'HMU', cnes: '2337360', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Av. Araguaia nº 200, Setor Bueno', phone: '(62) 3524-1400', type: 'Hospital', active: true },
  { id: 'u4', name: 'Policlínica Sul', shortName: 'Policlínica Sul', cnes: '2337379', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Rua 116 nº 400, Setor Sul', phone: '(62) 3524-1500', type: 'Policlínica', active: true },
  { id: 'u5', name: 'Centro de Especialidades Odontológicas', shortName: 'CEO', cnes: '2337387', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Rua 4 nº 800, Setor Oeste', phone: '(62) 3524-1600', type: 'CEO', active: true },
  { id: 'u6', name: 'CAPS AD III – Centro de Atenção Psicossocial', shortName: 'CAPS AD', cnes: '2337395', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Rua 20 nº 300, Vila Nova', phone: '(62) 3524-1700', type: 'CAPS', active: true },
  { id: 'u7', name: 'UBS Jardim Goiás', shortName: 'UBS Jd. Goiás', cnes: '2337409', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Rua Córrego Rico nº 150, Jardim Goiás', phone: '(62) 3524-1800', type: 'UBS', active: true },
  { id: 'u8', name: 'UPA 24h Leste', shortName: 'UPA Leste', cnes: '2337417', ibge: '5208707', city: 'Goiânia', state: 'GO', address: 'Av. T-9 nº 2200, Setor Bueno', phone: '(62) 3524-1900', type: 'UPA', active: false },
]

export const getUnitById = (id: string) => mockUnits.find(u => u.id === id)
export const getActiveUnits = () => mockUnits.filter(u => u.active)
