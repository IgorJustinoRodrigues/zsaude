import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, UserCircle, Loader2, CheckCircle2, AlertTriangle, ScanFace } from 'lucide-react'
import { apiFetchBlob, HttpError } from '../../../api/client'
import { userApi, type UserFaceEnrollment } from '../../../api/users'
import { toast } from '../../../store/toastStore'
import { cn } from '../../../lib/utils'
import { PhotoCropModal } from '../../../components/ui/PhotoCropModal'
import { FaceRecognitionModal } from '../../hsp/components/FaceRecognitionModal'

interface Props {
  userId: string
  /** Nome para alt + mensagens de toast. */
  userName: string
  /** Quando true, esconde os botões de edição (visualização apenas). */
  readonly?: boolean
}

const FACE_LABEL: Record<UserFaceEnrollment, { label: string; tone: 'ok' | 'warn' | 'err' | 'info' }> = {
  ok:          { label: 'Reconhecimento facial ativo',               tone: 'ok'   },
  no_face:     { label: 'Nenhum rosto detectado na foto',            tone: 'warn' },
  low_quality: { label: 'Qualidade baixa — envie uma foto mais nítida', tone: 'warn' },
  error:       { label: 'Falha ao processar reconhecimento facial',  tone: 'err'  },
  disabled:    { label: 'Reconhecimento facial indisponível neste banco', tone: 'info' },
  opted_out:   { label: 'Reconhecimento facial desativado pelo usuário', tone: 'info' },
}

/**
 * Upload/visualização da foto do usuário.
 *
 * Mesma UX da foto do paciente:
 * - "Enviar foto": abre PhotoCropModal (seleciona arquivo + recorte circular 1:1).
 * - "Tirar com câmera": abre FaceRecognitionModal (mode="enroll") — localiza rosto
 *   via MediaPipe, captura automaticamente quando estável.
 *
 * Em ambos os fluxos o resultado é um dataUrl que vira ``File`` e é enviado
 * pro backend via ``userApi.uploadPhoto``.
 */
export function UserPhotoField({ userId, userName, readonly = false }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [cacheKey, setCacheKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [faceStatus, setFaceStatus] = useState<UserFaceEnrollment | null>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [showFaceCapture, setShowFaceCapture] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // Carrega a foto atual (200 → blob, 404 → sem foto ainda)
  useEffect(() => {
    let alive = true
    let createdUrl: string | null = null
    setLoading(true)
    apiFetchBlob(`/api/v1/users/${userId}/photo`)
      .then(blob => {
        if (!alive) return
        createdUrl = URL.createObjectURL(blob)
        setSrc(createdUrl)
      })
      .catch(() => { if (alive) setSrc(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => {
      alive = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [userId, cacheKey])

  async function uploadFromDataUrl(dataUrl: string) {
    setUploading(true)
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })
      const res = await userApi.uploadPhoto(userId, file)
      if (!mountedRef.current) return
      setFaceStatus(res.faceEnrollment)
      setCacheKey(k => k + 1)
      const status = res.faceEnrollment
      if (status === 'ok') {
        toast.success('Foto atualizada', `Rosto de ${userName} cadastrado no reconhecimento.`)
      } else if (status === 'no_face') {
        toast.warning('Foto atualizada',
          'Não detectamos rosto nesta imagem — ela não será usada no reconhecimento facial.')
      } else if (status === 'low_quality') {
        toast.warning('Foto atualizada',
          'Qualidade do rosto abaixo do ideal. Tente uma foto com mais luz.')
      } else {
        toast.success('Foto atualizada.')
      }
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao enviar foto.'
      toast.error('Erro ao enviar foto', msg)
    } finally {
      if (mountedRef.current) setUploading(false)
    }
  }

  async function handleCropConfirm(dataUrl: string) {
    setShowCropModal(false)
    await uploadFromDataUrl(dataUrl)
  }

  async function handleFaceCapture(dataUrl: string) {
    setShowFaceCapture(false)
    await uploadFromDataUrl(dataUrl)
  }

  async function handleRemove() {
    if (!window.confirm(`Remover a foto de ${userName}?`)) return
    setUploading(true)
    try {
      await userApi.removePhoto(userId)
      if (!mountedRef.current) return
      setSrc(null)
      setFaceStatus(null)
      setCacheKey(k => k + 1)
      toast.success('Foto removida', `A foto de ${userName} foi removida.`)
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao remover foto.'
      toast.error('Erro ao remover', msg)
    } finally {
      if (mountedRef.current) setUploading(false)
    }
  }

  const statusInfo = faceStatus ? FACE_LABEL[faceStatus] : null

  return (
    <>
      <div className="flex items-start gap-5">
        {/* Thumbnail */}
        <div className="relative shrink-0">
          <div className="w-28 h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-700">
            {loading ? (
              <Loader2 size={20} className="text-slate-400 animate-spin" />
            ) : src ? (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img src={src} alt={`Foto de ${userName}`} className="w-full h-full object-cover" />
            ) : (
              <UserCircle size={54} className="text-slate-300 dark:text-slate-600" strokeWidth={1.2} />
            )}
          </div>

          {uploading && (
            <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
              <Loader2 size={18} className="text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Formatos aceitos: JPEG, PNG ou WEBP · Tamanho máximo 10 MB.
            A foto é usada para identificação visual e reconhecimento facial do usuário.
          </p>

          {!readonly && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowCropModal(true)}
                  disabled={uploading}
                  title="Escolher uma imagem do dispositivo"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                >
                  <Camera size={14} />
                  {src ? 'Trocar foto' : 'Enviar foto'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFaceCapture(true)}
                  disabled={uploading}
                  title="Usar a câmera — localiza o rosto, recorta automaticamente e já indexa pro reconhecimento"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-sky-400 text-sky-700 dark:text-sky-400 text-xs font-medium hover:bg-sky-50 dark:hover:bg-sky-950/30 disabled:opacity-50 transition-colors"
                >
                  <ScanFace size={14} />
                  Tirar com câmera
                </button>
                {src && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 size={13} />
                    Remover
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ao tirar pela câmera, o sistema procura o rosto, recorta no melhor enquadramento e já cadastra no reconhecimento facial.
              </p>
            </>
          )}

          {statusInfo && (
            <div
              className={cn(
                'inline-flex items-start gap-2 px-3 py-2 rounded-lg text-xs',
                statusInfo.tone === 'ok'   && 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900',
                statusInfo.tone === 'warn' && 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900',
                statusInfo.tone === 'err'  && 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900',
                statusInfo.tone === 'info' && 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
              )}
            >
              {statusInfo.tone === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> :
                                           <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
              <span>{statusInfo.label}</span>
            </div>
          )}
        </div>
      </div>

      {showCropModal && (
        <PhotoCropModal
          onConfirm={handleCropConfirm}
          onClose={() => setShowCropModal(false)}
        />
      )}
      {showFaceCapture && (
        <FaceRecognitionModal
          mode="enroll"
          onClose={() => setShowFaceCapture(false)}
          onCapture={handleFaceCapture}
        />
      )}
    </>
  )
}
