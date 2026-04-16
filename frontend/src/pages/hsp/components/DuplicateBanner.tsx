import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { DuplicateMatch } from '../hooks/useDuplicateCheck'
import { formatCPF, formatDate, calcAge } from '../../../lib/utils'

interface Props {
  match: DuplicateMatch
}

/**
 * Banner exibido quando o CPF/CNS digitado bate com paciente já cadastrado.
 * Mostra a identificação do paciente e permite abrir direto o prontuário.
 */
export function DuplicateBanner({ match }: Props) {
  const navigate = useNavigate()
  const { patient, field } = match

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 flex items-start gap-3">
      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          {field === 'cpf' ? 'CPF' : 'CNS'} já cadastrado neste município
        </p>
        <p className="text-xs text-amber-800 mt-0.5">
          <span className="font-medium">
            {patient.socialName || patient.name}
          </span>
          {patient.cpf && ` · CPF ${formatCPF(patient.cpf)}`}
          {patient.birthDate && ` · nascido(a) em ${formatDate(patient.birthDate)} (${calcAge(patient.birthDate)} anos)`}
          {` · prontuário ${patient.prontuario}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate(`/hsp/pacientes/${patient.id}`)}
        className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700 shrink-0"
      >
        Abrir cadastro
        <ArrowRight size={12} />
      </button>
    </div>
  )
}
