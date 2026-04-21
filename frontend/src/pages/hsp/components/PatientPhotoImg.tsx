import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { apiFetchBlob } from '../../../api/client'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  patientId: string
  /** Quando ausente, busca a foto atual do paciente. */
  photoId?: string
  /** Quando true, atualiza ao mudar a key. Útil pra forçar refresh. */
  cacheKey?: string | number
  /** Conteúdo a renderizar enquanto carrega (default: nada). */
  fallback?: React.ReactNode
}

/**
 * Renderiza a foto do paciente fazendo fetch autenticado (Bearer + X-Work-Context)
 * e gerando uma blob URL. O <img> direto não funciona porque o backend exige
 * headers que o navegador não envia em tags <img>.
 */
export function PatientPhotoImg({
  patientId, photoId, cacheKey, fallback, ...imgProps
}: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    let createdUrl: string | null = null

    const path = photoId
      ? `/api/v1/hsp/patients/${patientId}/photos/${photoId}`
      : `/api/v1/hsp/patients/${patientId}/photo`

    apiFetchBlob(path, { withContext: true })
      .then(blob => {
        if (!alive) return
        createdUrl = URL.createObjectURL(blob)
        setSrc(createdUrl)
        setError(false)
      })
      .catch(() => { if (alive) { setError(true); setSrc(null) } })

    return () => {
      alive = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [patientId, photoId, cacheKey])

  if (error || !src) return <>{fallback ?? null}</>

  return <img {...imgProps} src={src} />
}
