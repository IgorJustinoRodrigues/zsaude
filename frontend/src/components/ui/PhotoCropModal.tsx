import { useEffect, useState, useRef } from 'react'
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Upload, X, Check, RotateCcw, Wand2, Loader2, ZoomOut } from 'lucide-react'

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
  /** Exibe botão "Remover fundo com IA". Default false. */
  allowBgRemoval?: boolean
  /** Exibe slider de zoom (para caber imagens fora do aspect). Default false. */
  allowZoom?: boolean
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
  allowBgRemoval = false,
  allowZoom = false,
}: Props) {
  const [mode,           setMode]           = useState<Mode>('select')
  /** Imagem "base" sem padding — upload original ou versão após remoção de fundo. */
  const [baseSrc,        setBaseSrc]        = useState<string | null>(null)
  /** Imagem exibida no ReactCrop — baseSrc com eventual padding de zoom. */
  const [imgSrc,         setImgSrc]         = useState<string | null>(null)
  /** Zoom-out: 1 = sem padding; 0.4 = imagem ocupa 40% do frame (padding ao redor). */
  const [zoom,           setZoom]           = useState(1)
  const [crop,           setCrop]           = useState<Crop>()

  // Remoção de fundo: quando concluída, a imagem fica transparente —
  // forçamos saída PNG no confirm pra preservar a transparência.
  const [bgRemoved, setBgRemoved] = useState(false)
  const [bgLoading, setBgLoading] = useState(false)
  const [bgProgress, setBgProgress] = useState<string | null>(null)

  const imgRef  = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Arquivo ───────────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setBaseSrc(ev.target?.result as string)
      setZoom(1)
      setBgRemoved(false)
      setCrop(undefined)
      setMode('crop')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Derivar imgSrc a partir de baseSrc + zoom ─────────────────────────────

  useEffect(() => {
    if (!baseSrc) { setImgSrc(null); return }
    if (zoom >= 0.999) { setImgSrc(baseSrc); return }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  / zoom)
      canvas.height = Math.round(img.height / zoom)
      const ctx = canvas.getContext('2d')!
      // Saída final será PNG (com transparência) quando o fundo foi removido
      // ou quando ``outputPng`` estiver ativo — nesse caso o padding fica
      // transparente. Senão, fundo branco (para o JPEG não ficar preto).
      const transparent = bgRemoved || outputPng
      if (!transparent) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      const x = (canvas.width  - img.width)  / 2
      const y = (canvas.height - img.height) / 2
      ctx.drawImage(img, x, y)
      setImgSrc(canvas.toDataURL(transparent ? 'image/png' : 'image/jpeg', 1))
    }
    img.src = baseSrc
    return () => { cancelled = true }
  }, [baseSrc, zoom, bgRemoved, outputPng])

  // ── Crop ──────────────────────────────────────────────────────────────────

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    // Só recria o crop se ainda não há um (preserva ajuste do usuário entre
    // mudanças de zoom, já que o crop é armazenado em %).
    if (!crop) setCrop(centerAspectCrop(width, height, aspect))
  }

  const handleConfirm = async () => {
    if (!imgRef.current || !crop) return
    const img = imgRef.current
    // Converte o crop (em %) para px usando as dimensões ATUAIS da imagem
    // renderizada — evita usar um ``completedCrop`` desatualizado após zoom.
    const pixelCrop: PixelCrop = crop.unit === 'px'
      ? (crop as PixelCrop)
      : {
          unit:   'px',
          x:      Math.round(crop.x      / 100 * img.width),
          y:      Math.round(crop.y      / 100 * img.height),
          width:  Math.round(crop.width  / 100 * img.width),
          height: Math.round(crop.height / 100 * img.height),
        }
    // Se a IA removeu o fundo, saída precisa ser PNG pra manter transparência.
    const asPng = outputPng || bgRemoved
    const dataUrl = await getCroppedDataUrl(
      img, pixelCrop, aspect, outputSize, quality, asPng,
    )
    onConfirm(dataUrl)
  }

  const handleReset = () => {
    setBaseSrc(null)
    setImgSrc(null)
    setZoom(1)
    setCrop(undefined)
    setBgRemoved(false)
    setBgLoading(false)
    setBgProgress(null)
    setMode('select')
  }

  /**
   * Remove fundo via @imgly/background-removal (WASM, roda no browser).
   * No primeiro uso baixa modelo (~30MB) — mostramos progresso.
   */
  const handleRemoveBg = async () => {
    if (!baseSrc || bgLoading) return
    setBgLoading(true)
    setBgProgress('Preparando...')
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const resultBlob = await removeBackground(baseSrc, {
        progress: (key, current, total) => {
          // keys: fetch:*, compute:*, etc. Mostramos um texto amigável.
          const pct = total > 0 ? Math.round((current / total) * 100) : 0
          if (key.startsWith('fetch:')) setBgProgress(`Baixando modelo... ${pct}%`)
          else if (key.startsWith('compute:')) setBgProgress(`Processando... ${pct}%`)
          else setBgProgress(`${pct}%`)
        },
      })
      const reader = new FileReader()
      reader.onload = () => {
        const url = reader.result as string
        setBaseSrc(url)       // base atualizada → effect re-renderiza imgSrc
        setBgRemoved(true)
        setBgLoading(false)
        setBgProgress(null)
        // Conteúdo mudou — libera o auto-center crop no próximo onImageLoad
        setCrop(undefined)
      }
      reader.readAsDataURL(resultBlob)
    } catch (err) {
      console.error('background removal failed', err)
      setBgLoading(false)
      setBgProgress(null)
      alert('Não foi possível remover o fundo. Tente novamente ou use uma imagem diferente.')
    }
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
              <div
                className="flex justify-center rounded-lg overflow-hidden"
                style={bgRemoved ? {
                  // Xadrez pra evidenciar transparência
                  backgroundImage: 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
                } : undefined}
              >
                <ReactCrop
                  crop={crop}
                  onChange={c => setCrop(c)}
                  aspect={aspect}
                  circularCrop={circularCrop && aspect === 1}
                  minWidth={60}
                  className="max-h-72"
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

              {allowZoom && (
                <div className="flex items-center gap-3 px-1">
                  <ZoomOut size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="range"
                    min={0.35}
                    max={1}
                    step={0.01}
                    value={zoom}
                    onChange={e => setZoom(parseFloat(e.target.value))}
                    className="flex-1 accent-sky-500"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums w-10 text-right">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
              )}

              {allowBgRemoval && (
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleRemoveBg}
                    disabled={bgLoading || bgRemoved}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {bgLoading ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        {bgProgress || 'Processando...'}
                      </>
                    ) : bgRemoved ? (
                      <>
                        <Check size={13} />
                        Fundo removido
                      </>
                    ) : (
                      <>
                        <Wand2 size={13} />
                        Remover fundo com IA
                      </>
                    )}
                  </button>
                </div>
              )}
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
