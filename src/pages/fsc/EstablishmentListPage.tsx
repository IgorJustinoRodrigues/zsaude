import { PageHeader } from '../../components/shared/PageHeader'
import { DataTable } from '../../components/shared/DataTable'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockEstablishments } from '../../mock/establishments'
import { formatDate } from '../../lib/utils'
import type { Establishment } from '../../types'

const columns = [
  {
    key: 'name', header: 'Estabelecimento',
    render: (e: Establishment) => (
      <div>
        <p className="text-sm font-medium">{e.name}</p>
        <p className="text-xs text-muted-foreground">{e.type} · {e.cnpj}</p>
      </div>
    )
  },
  { key: 'responsible', header: 'Responsável', render: (e: Establishment) => <span className="text-sm">{e.responsible}</span> },
  { key: 'address', header: 'Bairro', render: (e: Establishment) => <span className="text-sm text-muted-foreground">{e.address.neighborhood}</span> },
  { key: 'licenseExpiry', header: 'Vencimento Alvará', render: (e: Establishment) => <span className="text-sm">{formatDate(e.licenseExpiry)}</span> },
  { key: 'licenseStatus', header: 'Alvará', render: (e: Establishment) => <StatusBadge status={e.licenseStatus} /> },
  { key: 'status', header: 'Situação', render: (e: Establishment) => <StatusBadge status={e.status} /> },
]

export function EstablishmentListPage() {
  return (
    <div>
      <PageHeader
        title="Estabelecimentos"
        subtitle={`${mockEstablishments.length} estabelecimentos cadastrados`}
      />
      <DataTable
        columns={columns}
        data={mockEstablishments}
        searchable
        searchKeys={['name', 'type', 'responsible', 'cnpj']}
        searchPlaceholder="Buscar por nome, tipo, CNPJ..."
        keyExtractor={e => e.id}
      />
    </div>
  )
}
