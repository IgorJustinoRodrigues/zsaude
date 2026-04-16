import { useEffect, useState } from 'react'
import { hspApi, type PatientListItem } from '../../../api/hsp'
import { validateCns, validateCpf } from '../../../lib/validators'

export interface DuplicateMatch {
  patient: PatientListItem
  field: 'cpf' | 'cns'
}

interface Opts {
  cpf?: string | null
  cns?: string | null
  /** ID do paciente atual — ignora ele na checagem (modo edição). */
  excludeId?: string
}

/**
 * Procura paciente existente cujo CPF ou CNS bata com o informado.
 * Só dispara quando o valor tem o tamanho certo e passa na validação oficial.
 * Debounce de 400ms pra não disparar a cada tecla.
 */
export function useDuplicateCheck({ cpf, cns, excludeId }: Opts) {
  const [match, setMatch] = useState<DuplicateMatch | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const cleanCpf = (cpf ?? '').replace(/\D/g, '')
    const cleanCns = (cns ?? '').replace(/\D/g, '')

    const cpfValid = cleanCpf.length === 11 && !validateCpf(cleanCpf)
    const cnsValid = cleanCns.length === 15 && !validateCns(cleanCns)

    if (!cpfValid && !cnsValid) {
      setMatch(null)
      return
    }

    let alive = true
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        // Prioriza CPF se tiver; senão busca por CNS.
        const search = cpfValid ? cleanCpf : cleanCns
        const res = await hspApi.list({ search, pageSize: 5 })
        if (!alive) return

        const found = res.items.find(p => {
          if (p.id === excludeId) return false
          if (cpfValid && p.cpf && p.cpf.replace(/\D/g, '') === cleanCpf) return true
          if (cnsValid && p.cns && p.cns.replace(/\D/g, '') === cleanCns) return true
          return false
        })

        if (found) {
          setMatch({
            patient: found,
            field: cpfValid && found.cpf?.replace(/\D/g, '') === cleanCpf ? 'cpf' : 'cns',
          })
        } else {
          setMatch(null)
        }
      } catch {
        if (alive) setMatch(null)
      } finally {
        if (alive) setLoading(false)
      }
    }, 400)

    return () => {
      alive = false
      clearTimeout(handle)
    }
  }, [cpf, cns, excludeId])

  return { match, loading }
}
