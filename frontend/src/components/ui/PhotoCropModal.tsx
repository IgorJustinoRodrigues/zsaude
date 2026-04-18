import { useState, useRef } from 'react'
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Upload, X, Check, RotateCcw } from 'lucide-react'

interface Props {
  onConfirm: (dataUrl: string) => void
  onClose: () => void
  /** Proporção largura/altura. Default 1 (quadrado). Use 3 para logo horizontal. */
  aspect?: number
  /** Recorte circular (só faz sentido com aspect=1). Default true. */
  circularCrop?: boolean
  /** Lado maior do output em pixels. Default 400. Para logo use 600-1200. */
  outputSize?: number
  /** Título do modal. Default "Adicionar foto". */
  title?: string
  /** Texto do botão final. Default "Usar esta foto". */
  confirmLabel?: string
  /** Tipos aceitos no file input. Default 'image/*'. */
  accept?: string
  /** Qualidade JPEG (0-1). Default 0.92. Use 1 para logos com fundo branco. */
  quality?: number
  /** Saída como PNG (fundo transparente preservado). Default false (JPEG). */
  outputPng?: boolean
}

type Mode = 'select' | 'crop'

function centerAspectCrop(w: number, h: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, aspect, w, h),
    w, h,
  )
}

async function getCroppedDataUrl(
  image: HTMLImageElement,
  crop: PixelCrop,
  aspect: number,
  outputSize: number,
  quality: number,
  outputPng: boolean,
): Promise<string> {
  const canvas = document.createElement('canvas')
  // Maior dimensão fica com ``outputSize``; a outra é proporcional.
  const outW = aspect >= 1 ? outputSize : Math.round(outputSize * aspect)
  const outH = aspect >= 1 ? Math.round(outputSize / aspect) : outputSize
  canvas.width  = outW
  canvas.height = outH

  const scaleX = image.naturalWidth  / image.width
  const scaleY = image.naturalHeight / image.height

  const ctx = canvas.getContext('2d')!
  // PNG mantém transparência; JPEG recebe fundo branco (melhor pra logo
  // sobre fundo escuro).
  if (!outputPng) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outW, outH)
  }
  ctx.drawImage(
    image,
    crop.x      * scaleX,
    crop.y      * scaleY,
    crop.width  * scaleX,
    crop.height * scaleY,
    0, 0, outW, outH,
  )
  return canvas.toDataURL(outputPng ? 'image/png' : 'image/jpeg', quality)
}

export function PhotoCropModal({
  onConfirm, onClose,
  aspect = 1,
  circularCrop = true,
  outputSize = 400,
  title = 'Adicionar foto',
  confirmLabel = 'Usar esta foto',
  accept = 'image/*',
  quality = 0.92,
  outputPng = false,
}: Props) {
  const [mode,           setMode]           = useState<Mode>('select')
  const [imgSrc,         setImgSrc]         = useState<string | null>(null)
  const [crop,           setCrop]           = useState<Crop>()
  const [completedCrop,  setCompletedCrop]  = useState<PixelCrop>()

  const imgRef  = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    setCrop(centerAspectCrop(width, height, aspect))
  }

  const handleConfirm = async () => {
    if (!imgRef.current || !completedCrop) return
    const dataUrl = await getCroppedDataUrl(
      imgRef.current, completedCrop, aspect, outputSize, quality, outputPng,
    )
    onConfirm(dataUrl)
  }

  const handleReset = () => {
    setImgSrc(null)
    setCrop(undefined)
    setCompletedCrop(undefined)
    setMode('select')
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
              {mode === 'select' ? title : 'Ajustar recorte'}
            </h2>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5">

          {/* Selecionar arquivo */}
          {mode === 'select' && (
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
              <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
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
                  aspect={aspect}
                  circularCrop={circularCrop && aspect === 1}
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
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
