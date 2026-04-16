import { useNavigate } from 'react-router-dom'
import { ScanFace, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'
import type { MatchCandidate } from '../../../api/face'
import { PatientPhotoImg } from './PatientPhotoImg'
import { calcAge, cn, formatDate, initials } from '../../../lib/utils'

interface Props {
  candidates: MatchCandidate[]
  onDismiss: () => void
}

/** Cor + label da barra de confiança baseados no score de similaridade. */
function confidenceBadge(similarity: number) {
  if (similarity >= 0.85) {
    return {
      label: 'Provavelmente é ele(a)',
      bar: 'bg-emerald-500',
      chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
      icon: <CheckCircle2 size={12} />,
    }
  }
  if (similarity >= 0.70) {
    return {
      label: 'Confira com o paciente',
      bar: 'bg-amber-500',
      chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
      icon: <AlertCircle size={12} />,
    }
  }
  return {
    label: 'Baixa confiança',
    bar: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    icon: <AlertCircle size={12} />,
  }
}

/**
 * Renderiza os candidatos retornados pelo endpoint de match facial.
 * Click em um card navega pro prontuário do paciente.
 */
export function FaceMatchResults({ candidates, onDismiss }: Props) {
  const navigate = useNavigate()

  if (candidates.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mb-3">
          <ScanFace size={20} />
        </div>
        <p className="text-sm font-medium">Nenhum paciente reconhecido</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Nenhum rosto na base bateu com a imagem capturada. O paciente pode
          não estar cadastrado, ou a foto atual dele pode precisar ser
          atualizada.
        </p>
        <button
          onClick={onDismiss}
          className="mt-4 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted"
        >
          Fechar
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanFace size={14} className="text-primary" />
          <p className="text-sm">
            <span className="font-medium">{candidates.length}</span>{' '}
            {candidates.length === 1 ? 'candidato encontrado' : 'candidatos encontrados'}
          </p>
        </div>
        <button onClick={onDismiss}
          className="text-xs text-muted-foreground hover:underline">
          Nova busca
        </button>
      </div>

      <ul className="divide-y divide-border">
        {candidates.map(c => {
          const conf = confidenceBadge(c.similarity)
          const pct = Math.round(c.similarity * 100)
          const displayName = c.socialName || c.name

          return (
            <li
              key={c.patientId}
              onClick={() => navigate(`/hsp/pacientes/${c.patientId}`)}
              className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30"
            >
              <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
                {c.hasPhoto ? (
                  <PatientPhotoImg
                    patientId={c.patientId}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    fallback={initials(displayName)}
                  />
                ) : initials(displayName)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="font-medium text-sm truncate">{displayName}</p>
                  {c.socialName && c.name !== c.socialName && (
                    <span className="text-xs text-muted-foreground truncate">
                      ({c.name})
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.cpfMasked && <>CPF {c.cpfMasked}</>}
                  {c.cpfMasked && c.birthDate && <> · </>}
                  {c.birthDate && <>
                    {formatDate(c.birthDate)} ({calcAge(c.birthDate)} anos)
                  </>}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[140px]">
                    <div
                      className={cn('h-full', conf.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1',
                    conf.chip,
                  )}>
                    {conf.icon} {pct}% · {conf.label}
                  </span>
                </div>
              </div>

              <ArrowRight size={15} className="text-muted-foreground shrink-0" />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
