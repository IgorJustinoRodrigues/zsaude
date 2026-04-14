import { Truck, Car } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { StatsCard } from '../../components/shared/StatsCard'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { mockVehicles } from '../../mock/vehicles'

export function ADMHomePage() {
  const disponivel = mockVehicles.filter(v => v.status === 'Disponível').length
  const emUso = mockVehicles.filter(v => v.status === 'Em Uso').length
  const manutencao = mockVehicles.filter(v => v.status === 'Manutenção').length
  const navigate = useNavigate()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Administrativo – Gestão de Frota</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Monitoramento de veículos e transporte de saúde</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatsCard label="Disponíveis" value={disponivel} icon={<Car size={20} />} color="text-emerald-500" />
        <StatsCard label="Em Uso" value={emUso} icon={<Truck size={20} />} color="text-blue-500" />
        <StatsCard label="Em Manutenção" value={manutencao} icon={<Car size={20} />} color="text-amber-500" />
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Frota</h2>
          <a href="/adm/veiculos" className="text-xs text-primary hover:underline">Ver todos</a>
        </div>
        <div className="divide-y divide-border">
          {mockVehicles.map(v => (
            <div
              key={v.id}
              onClick={() => navigate('/adm/veiculos')}
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <Car size={18} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{v.brand} {v.model} ({v.year})</p>
                <p className="text-xs text-muted-foreground">
                  {v.plate} · {v.type} · {v.km.toLocaleString('pt-BR')} km
                  {v.driver ? ` · ${v.driver}` : ''}
                </p>
              </div>
              <StatusBadge status={v.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
