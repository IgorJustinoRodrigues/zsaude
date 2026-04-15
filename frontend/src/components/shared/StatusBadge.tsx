import { cn } from '../../lib/utils'
import type { AppointmentStatus, QueueStatus, TriageRisk, LicenseStatus, VehicleStatus } from '../../types'

type AnyStatus = AppointmentStatus | QueueStatus | TriageRisk | LicenseStatus | VehicleStatus | string

const STATUS_STYLES: Record<string, string> = {
  // Appointment
  'Agendado': 'bg-blue-100 text-blue-700',
  'Confirmado': 'bg-cyan-100 text-cyan-700',
  'Aguardando': 'bg-amber-100 text-amber-700',
  'Em Atendimento': 'bg-violet-100 text-violet-700',
  'Atendido': 'bg-emerald-100 text-emerald-700',
  'Ausente': 'bg-red-100 text-red-700',
  'Cancelado': 'bg-gray-100 text-gray-600',
  // Queue
  'Em Triagem': 'bg-orange-100 text-orange-700',
  // Triage risk
  'Imediato': 'bg-red-600 text-white',
  'Muito Urgente': 'bg-orange-500 text-white',
  'Urgente': 'bg-yellow-400 text-yellow-900',
  'Pouco Urgente': 'bg-emerald-500 text-white',
  'Não Urgente': 'bg-blue-500 text-white',
  // License
  'Válido': 'bg-emerald-100 text-emerald-700',
  'Vencido': 'bg-red-100 text-red-700',
  'Pendente': 'bg-amber-100 text-amber-700',
  // Vehicle
  'Disponível': 'bg-emerald-100 text-emerald-700',
  'Em Uso': 'bg-blue-100 text-blue-700',
  'Manutenção': 'bg-amber-100 text-amber-700',
  'Inativo': 'bg-gray-100 text-gray-500',
  // Establishment
  'Regular': 'bg-emerald-100 text-emerald-700',
  'Irregular': 'bg-red-100 text-red-700',
  'Interditado': 'bg-red-700 text-white',
  // Insurance
  'Ativo': 'bg-emerald-100 text-emerald-700',
  'Suspenso': 'bg-amber-100 text-amber-700',
  'Encerrado': 'bg-gray-100 text-gray-500',
}

interface Props { status: AnyStatus; className?: string }

export function StatusBadge({ status, className }: Props) {
  const styles = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap', styles, className)}>
      {status}
    </span>
  )
}
