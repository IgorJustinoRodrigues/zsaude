import { PageHeader } from '../../components/shared/PageHeader'
import { DataTable } from '../../components/shared/DataTable'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockVehicles } from '../../mock/vehicles'
import { formatDate } from '../../lib/utils'
import type { Vehicle } from '../../types'

const columns = [
  { key: 'plate', header: 'Placa', render: (v: Vehicle) => <span className="font-mono font-semibold">{v.plate}</span> },
  {
    key: 'vehicle', header: 'Veículo',
    render: (v: Vehicle) => (
      <div>
        <p className="text-sm font-medium">{v.brand} {v.model}</p>
        <p className="text-xs text-muted-foreground">{v.year} · {v.color} · {v.type}</p>
      </div>
    )
  },
  { key: 'driver', header: 'Motorista', render: (v: Vehicle) => <span className="text-sm">{v.driver ?? '—'}</span> },
  { key: 'km', header: 'Km', render: (v: Vehicle) => <span className="text-sm">{v.km.toLocaleString('pt-BR')}</span> },
  { key: 'maintenance', header: 'Última Manutenção', render: (v: Vehicle) => <span className="text-sm">{v.lastMaintenance ? formatDate(v.lastMaintenance) : '—'}</span> },
  { key: 'status', header: 'Status', render: (v: Vehicle) => <StatusBadge status={v.status} /> },
]

export function VehicleListPage() {
  return (
    <div>
      <PageHeader title="Veículos" subtitle={`${mockVehicles.length} veículos cadastrados`} />
      <DataTable
        columns={columns}
        data={mockVehicles}
        searchable
        searchKeys={['plate', 'brand', 'model', 'driver', 'type']}
        searchPlaceholder="Buscar por placa, modelo, motorista..."
        keyExtractor={v => v.id}
      />
    </div>
  )
}
