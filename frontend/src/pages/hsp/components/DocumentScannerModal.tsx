import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Camera, Loader2, RotateCcw, Check, ScanLine, AlertCircle, SwitchCamera } from 'lucide-react'
import { CameraPicker } from '../../../components/ui/CameraPicker'
import { useCameraPreferenceStore } from '../../../store/cameraPreferenceStore'

/**
 * Modal de scanner de documento. Abre câmera (prefere traseira), carrega
 * OpenCV.js + jScanify on-demand pra detectar contorno, captura automática
 * quando o documento fica estável. Por enquanto só entrega a imagem — a
 * extração com IA será plugada depois.
 */

// OpenCV.js é grande (~10MB) — carregado via CDN sob demanda.
// jScanify é leve e vem do npm via import (no bundle).
const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js'

// Janela de estabilidade pra auto-captura.
const STABLE_FRAMES_NEEDED = 20

// Timeouts em ms — evita ficar pendurado infinitamente.
const LIB_LOAD_TIMEOUT = 30_000
const OPENCV_READY_TIMEOUT = 20_000

interface Props {
  onClose: () => void
  onCapture: (dataUrl: string) => void
}

type Phase =
  | 'loading-libs'
  | 'picking-camera'
  | 'loading-camera'
  | 'scanning'
  | 'captured'
  | 'error'

// ─── Loaders singleton ───────────────────────────────────────────────────

interface OpenCvRuntime {
  onRuntimeInitialized?: () => void
  getBuildInformation?: () => string
}

interface CornerPoint { x: number; y: number }
interface CornerPoints {
  topLeftCorner: CornerPoint
  topRightCorner: CornerPoint
  bottomLeftCorner: CornerPoint
  bottomRightCorner: CornerPoint
}

interface ScannerInstance {
  highlightPaper: (c: HTMLCanvasElement) => HTMLCanvasElement
  extractPaper: (c: HTMLCanvasElement, w: number, h: number) => HTMLCanvasElement
  findPaperContour: (img: unknown) => { delete: () => void } | null
  getCornerPoints: (contour: unknown, img: unknown) => CornerPoints
}

let libsPromise: Promise<{ Scanner: new () => ScannerInstance }> | null = null

function loadLibs(): Promise<{ Scanner: new () => ScannerInstance }> {
  if (libsPromise) return libsPromise
  libsPromise = (async () => {
    await loadScript(OPENCV_URL)
    await waitOpenCvReady()
    // jScanify importado dinamicamente — só depois do OpenCV pronto.
    const mod = await import('jscanify/client')
    const Scanner = (mod.default ?? mod) as unknown as new () => ScannerInstance
    return { Scanner }
  })().catch(err => {
    libsPromise = null
    throw err
  })
  return libsPromise
}

/**
 * OpenCV.js carrega o script + WASM assincronamente. O `<script>.onload`
 * dispara antes do runtime WASM estar pronto. Precisamos: esperar `window.cv`
 * existir, depois aguardar `onRuntimeInitialized` (ou `getBuildInformation`
 * se já estiver pronto).
 */
async function waitOpenCvReady(): Promise<void> {
  const start = Date.now()
  // Passo 1: espera `cv` aparecer no window.
  while (!(window as unknown as { cv?: OpenCvRuntime }).cv) {
    if (Date.now() - start > OPENCV_READY_TIMEOUT) {
      throw new Error('Timeout esperando window.cv após carregar opencv.js')
    }
    await new Promise(r => setTimeout(r, 50))
  }
  const cv = (window as unknown as { cv: OpenCvRuntime }).cv

  // Passo 2: se já pronto, sai; senão escuta o evento.
  if (cv.getBuildInformation) return
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error('Timeout aguardando OpenCV.js inicializar o runtime WASM.')),
      OPENCV_READY_TIMEOUT,
    )
    cv.onRuntimeInitialized = () => { clearTimeout(t); resolve() }
  })
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    const timeout = setTimeout(
      () => reject(new Error(`Timeout carregando ${src}`)),
      LIB_LOAD_TIMEOUT,
    )
    s.onload = () => { clearTimeout(timeout); resolve() }
    s.onerror = () => { clearTimeout(timeout); reject(new Error(`Falha ao carregar ${src}`)) }
    document.head.appendChild(s)
  })
}

// ─── Componente ──────────────────────────────────────────────────────────

export function DocumentScannerModal({ onClose, onCapture }: Props) {
  const [phase, setPhase] = useState<Phase>('loading-libs')
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const cameraId = useCameraPreferenceStore(s => s.selections.document ?? null)
  const setCamera = useCameraPreferenceStore(s => s.setCamera)
  const clearCamera = useCameraPreferenceStore(s => s.clearCamera)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const stableRef = useRef(0)
  const smoothedRef = useRef<CornerPoints | null>(null)
  const scannerRef = useRef<ScannerInstance | null>(null)

  // ── Setup: carrega libs + abre câmera. Roda só nas mudanças de
  //         restartTick/cameraId — NÃO depende de `phase` (senão o
  //         setPhase aqui dentro disparava cleanup e parava o stream).
  const [restartTick, setRestartTick] = useState(0)
  useEffect(() => {
    let alive = true
    let localStream: MediaStream | null = null

    setPhase('loading-libs')
    setError(null)

    ;(async () => {
      try {
        // 1. Libs (cacheadas após a 1ª vez).
        const { Scanner } = await loadLibs()
        if (!alive) return
        scannerRef.current = new Scanner()

        // 2. Sem preferência de câmera salva → pede pra escolher.
        if (!cameraId) {
          if (alive) setPhase('picking-camera')
          return
        }

        // 3. Câmera.
        if (alive) setPhase('loading-camera')
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: cameraId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (!alive) {
          localStream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = localStream
        const v = videoRef.current
        if (v) {
          v.srcObject = localStream
          // Aguarda metadata pra termos videoWidth/Height antes do play.
          await new Promise<void>(resolve => {
            if (v.readyState >= 1) return resolve()
            v.onloadedmetadata = () => resolve()
          })
          await v.play()
        }

        if (alive) setPhase('scanning')
      } catch (err) {
        if (!alive) return
        localStream?.getTracks().forEach(t => t.stop())
        console.error('[DocumentScanner] setup failed:', err)
        // Câmera escolhida não existe mais (desconectou) — volta pro picker.
        if (err instanceof Error &&
            (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') &&
            cameraId) {
          clearCamera('document')
          setPhase('picking-camera')
          return
        }
        const isInsecure = !window.isSecureContext
        const msg =
          isInsecure
            ? 'Câmera só funciona em HTTPS ou localhost.'
            : err instanceof Error && err.name === 'NotAllowedError'
              ? 'Permissão da câmera negada. Verifique as configurações do navegador.'
              : err instanceof Error && err.name === 'NotFoundError'
                ? 'Nenhuma câmera encontrada no dispositivo.'
                : err instanceof Error
                  ? `Falha no scanner: ${err.message}`
                  : 'Erro desconhecido ao iniciar.'
        setError(msg)
        setPhase('error')
      }
    })()

    return () => {
      alive = false
      // Para o stream local (capturado neste run) e o streamRef.
      localStream?.getTracks().forEach(t => t.stop())
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [restartTick, cameraId, clearCamera])

  // ── Fase 3: loop de detecção ────────────────────────────────────────
  // Pipeline custom (mais robusta que findPaperContour do jscanify):
  // 1. cinza + bilateral filter (preserva edges)
  // 2. Canny adaptativo (thresholds calculados pelo mediano)
  // 3. dilate p/ unir bordas quebradas
  // 4. findContours, filtra por área, aspect ratio, convexidade
  // 5. approxPolyDP — fica com o quadrilátero de maior área plausível
  useEffect(() => {
    if (phase !== 'scanning') return
    const video = videoRef.current
    const overlay = overlayRef.current
    const cv = (window as unknown as { cv?: CvNs }).cv
    if (!video || !overlay || !cv) return

    const tmp = document.createElement('canvas')
    let frameCount = 0

    const tick = () => {
      if (!videoRef.current || video.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const { videoWidth: w, videoHeight: h } = video
      if (overlay.width !== w) overlay.width = w
      if (overlay.height !== h) overlay.height = h
      if (tmp.width !== w) tmp.width = w
      if (tmp.height !== h) tmp.height = h

      tmp.getContext('2d')!.drawImage(video, 0, 0, w, h)

      const ctx = overlay.getContext('2d')!
      ctx.clearRect(0, 0, w, h)

      // Roda detecção a cada 2 frames pra economizar CPU.
      let detected = false
      let corners: CornerPoints | null = null
      frameCount = (frameCount + 1) % 2
      if (frameCount === 0) {
        corners = detectDocument(cv, tmp)
        if (corners) {
          // Suaviza com média móvel pra evitar tremulação.
          smoothedRef.current = smoothCorners(smoothedRef.current, corners)
          detected = true
        }
      } else if (smoothedRef.current) {
        corners = smoothedRef.current
        detected = true
      }

      if (detected && corners) {
        stableRef.current += 1
        const isStable = stableRef.current >= STABLE_FRAMES_NEEDED * 0.6
        drawCorners(ctx, corners, isStable)
        if (stableRef.current >= STABLE_FRAMES_NEEDED) {
          doCapture()
          return
        }
      } else {
        stableRef.current = 0
        smoothedRef.current = null
        drawHint(ctx, w, h)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      smoothedRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Captura (manual ou automática) ──────────────────────────────────
  const doCapture = useCallback(() => {
    const video = videoRef.current
    const scanner = scannerRef.current as {
      extractPaper: (c: HTMLCanvasElement, w: number, h: number) => HTMLCanvasElement
    } | null
    if (!video || video.videoWidth === 0) return

    const frame = document.createElement('canvas')
    frame.width = video.videoWidth
    frame.height = video.videoHeight
    frame.getContext('2d')!.drawImage(video, 0, 0)

    let output = frame
    // Tenta warp-perspective com jscanify; se falhar, usa frame puro.
    if (scanner) {
      try {
        const extracted = scanner.extractPaper(frame, 1280, 800)
        if (extracted) output = extracted
      } catch { /* fallback pro frame cru */ }
    }

    const dataUrl = output.toDataURL('image/jpeg', 0.92)
    setCaptured(dataUrl)
    setPhase('captured')

    // Pausa stream pra parar consumo de câmera enquanto o user decide.
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const handleRetake = () => {
    setCaptured(null)
    stableRef.current = 0
    setRestartTick(t => t + 1)  // força re-setup
  }

  const handleUse = () => {
    if (!captured) return
    onCapture(captured)
    onClose()
  }

  const handlePickCamera = (deviceId: string) => {
    setCamera('document', deviceId)
    stableRef.current = 0
    setRestartTick(t => t + 1)
  }

  const openPicker = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setPhase('picking-camera')
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-2xl overflow-hidden flex flex-col"
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">
              {phase === 'captured' ? 'Documento capturado' : 'Ler documento'}
            </h3>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted">
            <X size={16} />
          </button>
        </header>

        <div className="relative bg-black aspect-video flex items-center justify-center">
          {phase === 'loading-libs' && (
            <Status icon={<Loader2 size={18} className="animate-spin" />}>
              Carregando o scanner... (primeira vez pode demorar alguns segundos)
            </Status>
          )}
          {phase === 'loading-camera' && (
            <Status icon={<Loader2 size={18} className="animate-spin" />}>
              Abrindo câmera...
            </Status>
          )}
          {phase === 'picking-camera' && (
            <div className="absolute inset-0 flex flex-col bg-card overflow-y-auto p-5">
              <div className="text-center mb-4">
                <p className="text-sm font-semibold">Qual câmera usar?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  A escolha fica salva e é usada nas próximas vezes.
                </p>
              </div>
              <CameraPicker
                selectedId={cameraId}
                onSelect={handlePickCamera}
              />
            </div>
          )}
          {phase === 'error' && (
            <Status icon={<AlertCircle size={18} className="text-rose-400" />}>
              {error ?? 'Erro desconhecido.'}
            </Status>
          )}

          {(phase === 'scanning' || phase === 'loading-camera') && (
            <>
              <video
                ref={videoRef}
                playsInline muted
                className="w-full h-full object-contain"
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
              {phase === 'scanning' && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs flex items-center gap-2">
                  <ScanLine size={12} /> Enquadre o documento — captura automática quando estabilizar
                </div>
              )}
            </>
          )}

          {phase === 'captured' && captured && (
            <img src={captured} alt="Documento capturado"
              className="w-full h-full object-contain bg-black" />
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-muted/30">
          {phase === 'scanning' && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted"
                  title="Trocar câmera"
                >
                  <SwitchCamera size={12} /> Trocar câmera
                </button>
              </div>
              <button
                type="button"
                onClick={doCapture}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 ml-auto"
              >
                <Camera size={14} /> Capturar agora
              </button>
            </>
          )}
          {phase === 'captured' && (
            <>
              <button type="button" onClick={handleRetake}
                className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted">
                <RotateCcw size={14} /> Refazer
              </button>
              <button type="button" onClick={handleUse}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 ml-auto">
                <Check size={14} /> Usar esta foto
              </button>
            </>
          )}
          {(phase === 'loading-libs' || phase === 'loading-camera'
            || phase === 'picking-camera' || phase === 'error') && (
            <button type="button" onClick={onClose}
              className="px-4 py-1.5 text-sm border border-border rounded-lg hover:bg-muted ml-auto">
              Cancelar
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

// ─── OpenCV.js bindings (mínimo necessário) ─────────────────────────────

interface CvMat {
  rows: number
  cols: number
  delete: () => void
  data32S: Int32Array
  intPtr: (row: number, col: number) => number[]
}
interface CvMatVec {
  size: () => number
  get: (i: number) => CvMat
  delete: () => void
}
interface CvSize { width?: number; height?: number }
interface CvNs {
  imread: (c: HTMLCanvasElement) => CvMat
  Mat: new () => CvMat
  MatVector: new () => CvMatVec
  Size: new (w: number, h: number) => CvSize
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void
  GaussianBlur: (src: CvMat, dst: CvMat, ksize: CvSize, sigmaX: number) => void
  Canny: (src: CvMat, dst: CvMat, t1: number, t2: number) => void
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat) => void
  getStructuringElement: (shape: number, ksize: CvSize) => CvMat
  findContours: (img: CvMat, contours: CvMatVec, hierarchy: CvMat, mode: number, method: number) => void
  contourArea: (contour: CvMat) => number
  arcLength: (contour: CvMat, closed: boolean) => number
  approxPolyDP: (contour: CvMat, dst: CvMat, epsilon: number, closed: boolean) => void
  isContourConvex: (contour: CvMat) => boolean
  COLOR_RGBA2GRAY: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
  MORPH_RECT: number
}

/**
 * Detecta o documento (quadrilátero de maior área plausível) na imagem.
 * Retorna os 4 cantos ordenados (TL, TR, BR, BL) ou null se não achou.
 */
function detectDocument(cv: CvNs, canvas: HTMLCanvasElement): CornerPoints | null {
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const dilated = new cv.Mat()
  const hierarchy = new cv.Mat()
  const contours = new cv.MatVector()
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))

  let result: CornerPoints | null = null
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    // Canny com thresholds fixos costuma render bem após blur. Valores
    // 50/150 funcionam pra a maioria das condições internas de hospital.
    cv.Canny(blurred, edges, 50, 150)
    cv.dilate(edges, dilated, kernel)
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const total = contours.size()
    const imgArea = src.rows * src.cols
    let bestArea = 0
    let bestQuad: CornerPoints | null = null

    for (let i = 0; i < total; i++) {
      const c = contours.get(i)
      const area = cv.contourArea(c)
      // Documento tem que ocupar pelo menos 8% da imagem.
      if (area < imgArea * 0.08) { c.delete(); continue }

      const peri = cv.arcLength(c, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(c, approx, 0.02 * peri, true)

      // Quer 4 vértices, convexo, e maior que o melhor anterior.
      if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea) {
        const pts: { x: number; y: number }[] = []
        for (let j = 0; j < 4; j++) {
          // approx.data32S = [x0,y0, x1,y1, x2,y2, x3,y3]
          pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] })
        }
        // Aspect ratio plausível pra documento (carteira/RG/CNH ~1.5).
        const ratio = quadAspectRatio(pts)
        if (ratio >= 0.5 && ratio <= 2.5) {
          bestArea = area
          bestQuad = orderCorners(pts)
        }
      }
      approx.delete()
      c.delete()
    }

    result = bestQuad
  } catch {
    /* se falhar, devolve null */
  } finally {
    src.delete(); gray.delete(); blurred.delete(); edges.delete()
    dilated.delete(); hierarchy.delete(); contours.delete(); kernel.delete()
  }
  return result
}

/** Ordena 4 pontos como TopLeft, TopRight, BottomRight, BottomLeft. */
function orderCorners(pts: { x: number; y: number }[]): CornerPoints {
  // soma e diferença identificam diagonais.
  const sums = pts.map(p => p.x + p.y)
  const diffs = pts.map(p => p.y - p.x)
  return {
    topLeftCorner:     pts[sums.indexOf(Math.min(...sums))],
    bottomRightCorner: pts[sums.indexOf(Math.max(...sums))],
    topRightCorner:    pts[diffs.indexOf(Math.min(...diffs))],
    bottomLeftCorner:  pts[diffs.indexOf(Math.max(...diffs))],
  }
}

function quadAspectRatio(pts: { x: number; y: number }[]): number {
  const dist = (a: typeof pts[0], b: typeof pts[0]) =>
    Math.hypot(a.x - b.x, a.y - b.y)
  const w = (dist(pts[0], pts[1]) + dist(pts[2], pts[3])) / 2
  const h = (dist(pts[1], pts[2]) + dist(pts[3], pts[0])) / 2
  return w === 0 ? 0 : h / w
}

/** Suaviza posição dos cantos com média ponderada — reduz tremulação. */
function smoothCorners(prev: CornerPoints | null, cur: CornerPoints, alpha = 0.35): CornerPoints {
  if (!prev) return cur
  const lerp = (a: CornerPoint, b: CornerPoint): CornerPoint => ({
    x: a.x * (1 - alpha) + b.x * alpha,
    y: a.y * (1 - alpha) + b.y * alpha,
  })
  return {
    topLeftCorner:     lerp(prev.topLeftCorner,     cur.topLeftCorner),
    topRightCorner:    lerp(prev.topRightCorner,    cur.topRightCorner),
    bottomRightCorner: lerp(prev.bottomRightCorner, cur.bottomRightCorner),
    bottomLeftCorner:  lerp(prev.bottomLeftCorner,  cur.bottomLeftCorner),
  }
}

// ─── Desenho do overlay ──────────────────────────────────────────────────

/** Desenha os 4 cantos + polígono. Cor amarela quando detectando, verde
 *  quando já considerou estável. Cantos com círculo destacado pra dar
 *  feedback visual claro. */
function drawCorners(ctx: CanvasRenderingContext2D, c: CornerPoints, stable: boolean) {
  const stroke = stable ? 'rgb(34, 197, 94)' : 'rgb(250, 204, 21)'
  const fill   = stable ? 'rgba(34, 197, 94, 0.18)' : 'rgba(250, 204, 21, 0.12)'
  const dot    = stable ? 'rgb(22, 163, 74)' : 'rgb(202, 138, 4)'

  const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner]

  // Polígono preenchido
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 5
  ctx.stroke()

  // Cantos destacados — círculo cheio
  ctx.fillStyle = dot
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Frame guia central + texto, exibido quando nada foi detectado. */
function drawHint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Retângulo guia central tracejado.
  const margin = Math.min(w, h) * 0.1
  const x = margin, y = margin * 1.5
  const rw = w - margin * 2, rh = h - margin * 3

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.lineWidth = 3
  ctx.setLineDash([14, 10])
  ctx.strokeRect(x, y, rw, rh)
  ctx.setLineDash([])

  // 4 marcas de canto (L shape) sólidas
  const arm = Math.min(rw, rh) * 0.08
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  // top-left
  ctx.beginPath(); ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y); ctx.stroke()
  // top-right
  ctx.beginPath(); ctx.moveTo(x + rw - arm, y); ctx.lineTo(x + rw, y); ctx.lineTo(x + rw, y + arm); ctx.stroke()
  // bottom-right
  ctx.beginPath(); ctx.moveTo(x + rw, y + rh - arm); ctx.lineTo(x + rw, y + rh); ctx.lineTo(x + rw - arm, y + rh); ctx.stroke()
  // bottom-left
  ctx.beginPath(); ctx.moveTo(x + arm, y + rh); ctx.lineTo(x, y + rh); ctx.lineTo(x, y + rh - arm); ctx.stroke()
}

function Status({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 text-white/80 text-sm text-center px-4">
      {icon}
      <p>{children}</p>
    </div>
  )
}
