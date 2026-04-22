// Galeria de fotos do paciente — recepção/admin revisa e gerencia:
//   - define qual é a oficial (current_photo_id)
//   - marca/desmarca foto como suspeita (anti-spoofing)
//   - vê quem enviou (totem vs usuário real)
//
// Carrega lista via hspApi.listPhotos. Cada tile faz fetch próprio via
// PatientPhotoImg (que já lida com auth).

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, ShieldAlert, ShieldOff, Star, X } from 'lucide-react'
import { HttpError } from '../../../api/client'
import { hspApi, type PatientPhotoMeta } from '../../../api/hsp'
import { toast } from '../../../store/toastStore'
import { formatDateTime, cn } from '../../../lib/utils'
import { PatientPhotoImg } from './PatientPhotoImg'

interface Props {
  patientId: string
  currentPhotoId: string | null
  onClose: () => void
  /** Chamado após qualquer mudança persistida — pai recarrega o paciente. */
  onChanged: () => void
}

export function PhotoGalleryModal({ patientId, currentPhotoId, onClose, onChanged }: Props) {
  const [photos, setPhotos] = useState<PatientPhotoMeta[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const list = await hspApi.listPhotos(patientId)
      // Mais recentes primeiro (backend já retorna assim, mas reforça).
      setPhotos([...list].sort((a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      ))
    } catch (err) {
      if (err instanceof HttpError) toast.error('Galeria', err.message)
    }
  }, [patientId])

  useEffect(() => { void reload() }, [reload])

  async function setAsCurrent(photo: PatientPhotoMeta) {
    setBusy(photo.id)
    try {
      await hspApi.restorePhoto(patientId, photo.id)
      toast.success('Foto oficial atualizada')
      await reload()
      onChanged()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Erro', err.message)
    } finally { setBusy(null) }
  }

  async function toggleFlag(photo: PatientPhotoMeta) {
    setBusy(photo.id)
    try {
      await hspApi.setPhotoFlag(patientId, photo.id, !photo.flagged)
      await reload()
      onChanged()
    } catch (err) {
      if (err instanceof HttpError) toast.error('Erro', err.message)
    } finally { setBusy(null) }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Galeria de fotos</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {photos?.length ?? 0} foto{(photos?.length ?? 0) === 1 ? '' : 's'} ·
              {' '}fotos com borda vermelha estão marcadas como suspeitas
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </header>

        <div className="p-5 overflow-y-auto flex-1">
          {photos === null ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-20 text-sm text-muted-foreground">
              Este paciente ainda não tem fotos.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {photos.map(p => {
                const isCurrent = p.id === currentPhotoId
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'relative rounded-xl border overflow-hidden bg-muted/30',
                      p.flagged
                        ? 'border-rose-400 ring-2 ring-rose-300/60 dark:border-rose-700'
                        : 'border-border',
                      isCurrent && 'ring-2 ring-primary',
                    )}
                  >
                    <div className="aspect-square">
                      <PatientPhotoImg
                        patientId={patientId}
                        photoId={p.id}
                        alt="Foto do paciente"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wider">
                          <Star size={9} /> Oficial
                        </span>
                      )}
                      {p.flagged && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-semibold uppercase tracking-wider">
                          <ShieldAlert size={9} /> Suspeita
                        </span>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-2 text-[10px] text-white/90">
                      <p className="truncate">{p.uploadedByName || 'Sistema'}</p>
                      <p className="text-white/60">{formatDateTime(p.uploadedAt)}</p>
                    </div>

                    {/* Ações */}
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      {!isCurrent && (
                        <button
                          onClick={() => setAsCurrent(p)}
                          disabled={busy === p.id}
                          title="Definir como foto oficial"
                          className="p-1.5 rounded bg-white/90 hover:bg-white text-slate-700 shadow disabled:opacity-50"
                        >
                          {busy === p.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Check size={13} />}
                        </button>
                      )}
                      <button
                        onClick={() => toggleFlag(p)}
                        disabled={busy === p.id}
                        title={p.flagged ? 'Desmarcar como suspeita' : 'Marcar como suspeita'}
                        className={cn(
                          'p-1.5 rounded shadow disabled:opacity-50',
                          p.flagged
                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            : 'bg-white/90 hover:bg-white text-rose-600',
                        )}
                      >
                        {p.flagged ? <ShieldOff size={13} /> : <ShieldAlert size={13} />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
