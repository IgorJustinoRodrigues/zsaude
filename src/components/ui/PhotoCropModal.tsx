import { useState, useRef, useCallback, useEffect } from 'react'
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Camera, Upload, X, Check, RotateCcw, SwitchCamera } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  onConfirm: (dataUrl: string) => void
  onClose: () => void
}

type Mode = 'select' | 'crop'
type Source = 'file' | 'camera'

function centerAspectCrop(w: number, h: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, 1, w, h),
    w, h,
  )
}

async function getCroppedDataUrl(
  image: HTMLImageElement,
  crop: PixelCrop,
): Promise<string> {
  const canvas  = document.createElement('canvas')
  const size    = 400
  canvas.width  = size
  canvas.height = size

  const scaleX = image.naturalWidth  / image.width
  const scaleY = image.naturalHeight / image.height

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    image,
    crop.x      * scaleX,
    crop.y      * scaleY,
    crop.width  * scaleX,
    crop.height * scaleY,
    0, 0, size, size,
  )
  return canvas.toDataURL('image/jpeg', 0.92)
}

export function PhotoCropModal({ onConfirm, onClose }: Props) {
  const [mode,       setMode]       = useState<Mode>('select')
  const [source,     setSource]     = useState<Source>('file')
  const [imgSrc,         setImgSrc]         = useState<string | null>(null)
  const [crop,           setCrop]           = useState<Crop>()
  const [completedCrop,  setCompletedCrop]  = useState<PixelCrop>()
  const [facingMode,     setFacingMode]     = useState<'user' | 'environment'>('user')
  const [camError,   setCamError]   = useState<string | null>(null)

  const imgRef     = useRef<HTMLImageElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)

  // ── Câmera ────────────────────────────────────────────────────────────────

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    setCamError(null)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setCamError('Não foi possível acessar a câmera. Verifique as permissões do navegador.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (source === 'camera' && mode === 'select') startCamera(facingMode)
    else stopCamera()
    return stopCamera
  }, [source, mode, facingMode, startCamera, stopCamera])

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    stopCamera()
    setImgSrc(canvas.toDataURL('image/jpeg'))
    setMode('crop')
  }

  const flipCamera = () => {
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    startCamera(next)
  }

  // ── Arquivo ───────────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setImgSrc(ev.target?.result as string)
      setMode('crop')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Crop ──────────────────────────────────────────────────────────────────

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height))
  }

  const handleConfirm = async () => {
    if (!imgRef.current || !completedCrop) return
    const dataUrl = await getCroppedDataUrl(imgRef.current, completedCrop)
    onConfirm(dataUrl)
  }

  const handleReset = () => {
    setImgSrc(null)
    setCrop(undefined)
    setCompletedCrop(undefined)
    setMode('select')
    if (source === 'camera') startCamera(facingMode)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {mode === 'crop' && (
              <button type="button" onClick={handleReset}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <RotateCcw size={16} />
              </button>
            )}
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {mode === 'select' ? 'Adicionar foto' : 'Ajustar recorte'}
            </h2>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Seleção de fonte */}
        {mode === 'select' && (
          <div className="flex border-b border-slate-100 dark:border-slate-800">
            {(['file', 'camera'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
                  source === s
                    ? 'text-sky-600 dark:text-sky-400 border-b-2 border-sky-500'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                )}
              >
                {s === 'file' ? <Upload size={15} /> : <Camera size={15} />}
                {s === 'file' ? 'Arquivo' : 'Câmera'}
              </button>
            ))}
          </div>
        )}

        {/* Conteúdo */}
        <div className="p-5">

          {/* Selecionar arquivo */}
          {mode === 'select' && source === 'file' && (
            <div
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 h-52 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-sky-400 dark:hover:border-sky-500 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Upload size={20} className="text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Clique para selecionar</p>
                <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP — até 10 MB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
          )}

          {/* Câmera */}
          {mode === 'select' && source === 'camera' && (
            <div className="relative">
              {camError ? (
                <div className="flex flex-col items-center justify-center gap-2 h-52 rounded-xl bg-slate-100 dark:bg-slate-800 text-center px-4">
                  <Camera size={28} className="text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">{camError}</p>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full rounded-xl bg-black"
                    style={{ maxHeight: 260, objectFit: 'cover' }}
                  />
                  {/* Guia 1:1 */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="border-2 border-white/70 rounded-full aspect-square w-40 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                  </div>
                  <button
                    type="button"
                    onClick={flipCamera}
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                    title="Virar câmera"
                  >
                    <SwitchCamera size={16} />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={capturePhoto}
                disabled={!!camError}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Camera size={15} />
                Tirar foto
              </button>
            </div>
          )}

          {/* Crop */}
          {mode === 'crop' && imgSrc && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Arraste e redimensione para ajustar o recorte
              </p>
              <div className="flex justify-center">
                <ReactCrop
                  crop={crop}
                  onChange={c => setCrop(c)}
                  onComplete={c => setCompletedCrop(c)}
                  aspect={1}
                  circularCrop
                  minWidth={60}
                  className="max-h-72 rounded-lg overflow-hidden"
                >
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt="Preview"
                    onLoad={onImageLoad}
                    className="max-h-72 object-contain"
                  />
                </ReactCrop>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'crop' && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={handleReset}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Tentar novamente
            </button>
            <button type="button" onClick={handleConfirm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white transition-colors">
              <Check size={14} />
              Usar esta foto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
