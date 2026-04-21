// Avatar de usuário — foto quando disponível, iniciais como fallback.
//
// A tag <img> padrão não serve porque o backend exige Bearer; buscamos via
// apiFetchBlob e geramos uma object URL, mesmo padrão do PatientPhotoImg.

import { useEffect, useState } from 'react'
import { apiFetchBlob } from '../../api/client'
import { initials, cn } from '../../lib/utils'

interface Props {
  userId: string
  userName: string
  /** ID da foto atual do usuário. Se null/undefined, renderiza iniciais direto. */
  photoId?: string | null
  /** Classes do wrapper (tamanho, fundo fallback). */
  className?: string
  /** Classes do texto das iniciais (font-size, font-weight). */
  initialsClassName?: string
  /** Invalidador de cache — muda quando você quer forçar re-fetch. */
  cacheKey?: string | number
}

export function UserAvatar({
  userId, userName, photoId, className, initialsClassName, cacheKey,
}: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!photoId) { setSrc(null); return }
    let alive = true
    let createdUrl: string | null = null
    apiFetchBlob(`/api/v1/users/${userId}/photo`)
      .then(blob => {
        if (!alive) return
        createdUrl = URL.createObjectURL(blob)
        setSrc(createdUrl)
      })
      .catch(() => { if (alive) setSrc(null) })
    return () => {
      alive = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [userId, photoId, cacheKey])

  if (src) {
    return (
      <div className={cn('rounded-full overflow-hidden bg-sky-500 shrink-0', className)}>
        <img src={src} alt={userName} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-full bg-sky-500 flex items-center justify-center text-white shrink-0',
      className,
    )}>
      <span className={cn('font-bold', initialsClassName)}>{initials(userName)}</span>
    </div>
  )
}
