import type { Vehicle } from '../types'

export const mockVehicles: Vehicle[] = [
  { id: 'v1', plate: 'GOI-1A23', brand: 'Volkswagen', model: 'Kombi', year: 2019, color: 'Branca', type: 'Van Sanitária', capacity: 8, status: 'Em Uso', driver: 'Marcos Antônio Silva', km: 128450, lastMaintenance: '2026-03-10' },
  { id: 'v2', plate: 'GOI-2B34', brand: 'Mercedes-Benz', model: 'Sprinter 415', year: 2021, color: 'Branca', type: 'Ambulância Tipo B', capacity: 2, status: 'Disponível', km: 87230, lastMaintenance: '2026-04-01' },
  { id: 'v3', plate: 'GOI-3C45', brand: 'Fiat', model: 'Doblò', year: 2020, color: 'Branca', type: 'Van de Transporte', capacity: 6, status: 'Manutenção', km: 95600, lastMaintenance: '2026-04-14' },
  { id: 'v4', plate: 'GOI-4D56', brand: 'Ford', model: 'Transit', year: 2022, color: 'Branca', type: 'Van Sanitária', capacity: 10, status: 'Disponível', driver: undefined, km: 45120, lastMaintenance: '2026-02-20' },
  { id: 'v5', plate: 'GOI-5E67', brand: 'Renault', model: 'Master', year: 2018, color: 'Branca', type: 'Ambulância Tipo A', capacity: 3, status: 'Em Uso', driver: 'José Carlos Ferreira', km: 215800, lastMaintenance: '2026-03-25' },
  { id: 'v6', plate: 'GOI-6F78', brand: 'Toyota', model: 'Hilux', year: 2023, color: 'Prata', type: 'Utilitário', capacity: 4, status: 'Disponível', km: 22340, lastMaintenance: '2026-01-15' },
  { id: 'v7', plate: 'GOI-7G89', brand: 'Iveco', model: 'Daily 70C17', year: 2017, color: 'Branca', type: 'Ambulância Tipo C', capacity: 1, status: 'Inativo', km: 312500, lastMaintenance: '2025-10-05' },
]
