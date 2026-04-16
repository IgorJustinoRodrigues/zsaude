import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Camera, Loader2, RotateCcw, Check, ScanFace, AlertCircle, SwitchCamera } from 'lucide-react'
import { CameraPicker } from '../../../components/ui/CameraPicker'
import { useCameraPreferenceStore } from '../../../store/cameraPreferenceStore'

/**
 * Modal de reconhecimento facial. Abre câmera (frontal), detecta rosto via
 * MediaPipe FaceDetector em tempo real, desenha bounding box, captura
 * automaticamente quando um único rosto permanece bem enquadrado e estável.
 *
 * Por enquanto só entrega o dataUrl pro caller via `onCapture`. O matching
 * com a base de pacientes (embedding + vector search) será plugado depois
 * no backend.
 */

interface Props {
  onClose: () => void
  /**
   * - ``match``: captura → envia ao backend pra reconhecer paciente.
   *   Callback ``onMatched`` recebe os candidatos.
   * - ``enroll``: apenas captura dataUrl (pra outros usos, ex: fluxo de
   *   cadastro de foto). Callback ``onCapture`` recebe o dataUrl.
   */
  mode?: 'match' | 'enroll'
  onCapture?: (dataUrl: string) => void
  onMatched?: (candidates: import('../../../api/face').MatchCandidate[]) => void
}

type Phase =
  | 'loading-libs'
  | 'picking-camera'
  | 'loading-camera'
  | 'scanning'
  | 'captured'
  | 'matching'
  | 'error'

// Modelo público do Google — leve (1MB) e rápido pra rostos próximos.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'

const STABLE_HOLD_MS = 1000   // tempo que o rosto precisa ficar estável antes de capturar
const MIN_FACE_RATIO = 0.18   // face ocupa ao menos 18% da largura
const MAX_FACE_RATIO = 0.85   // não muito próximo
const MIN_SCORE = 0.7

// ─── Loader singleton (MediaPipe) ────────────────────────────────────────

interface FaceDetection {
  boundingBox?: { originX: number; originY: number; width: number; height: number }
  categories?: Array<{ score: number }>
}
interface FaceDetectorInstance {
  detectForVideo: (video: HTMLVideoElement, ts: number) => { detections: FaceDetection[] }
  close: () => void
}

let detectorPromise: Promise<FaceDetectorInstance> | null = null

async function loadDetector(): Promise<FaceDetectorInstance> {
  if (detectorPromise) return detectorPromise
  detectorPromise = (async () => {
    const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(WASM_URL)
    return await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: MIN_SCORE,
    }) as unknown as FaceDetectorInstance
  })().catch(err => {
    detectorPromise = null
    throw err
  })
  return detectorPromise
}

// ─── Componente ──────────────────────────────────────────────────────────

export function FaceRecognitionModal({
  onClose, onCapture, onMatched, mode = 'match',
}: Props) {
  const [phase, setPhase] = useState<Phase>('loading-libs')
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [restartTick, setRestartTick] = useState(0)
  const [hint, setHint] = useState<string>('Posicione o rosto no centro')
  const cameraId = useCameraPreferenceStore(s => s.selections.face ?? null)
  const setCameraPref = useCameraPreferenceStore(s => s.setCamera)
  const clearCamera = useCameraPreferenceStore(s => s.clearCamera)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const stableRef = useRef(0)
  const detectorRef = useRef<FaceDetectorInstance | null>(null)
  // Último bbox válido do detector — usado pra recortar a captura no modo
  // enroll (queremos a foto centrada no rosto, não o frame inteiro).
  const lastBoxRef = useRef<{ originX: number; originY: number; width: number; height: number } | null>(null)

  // ── Setup: carrega detector + abre câmera ───────────────────────────
  useEffect(() => {
    let alive = true
    let localStream: MediaStream | null = null

    setPhase('loading-libs')
    setError(null)

    ;(async () => {
      try {
        const detector = await loadDetector()
        if (!alive) return
        detectorRef.current = detector

        // Sem preferência → pede pra escolher.
        if (!cameraId) {
          if (alive) setPhase('picking-camera')
          return
        }

        if (alive) setPhase('loading-camera')
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: cameraId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
        console.error('[FaceRecognition] setup failed:', err)
        if (err instanceof Error &&
            (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') &&
            cameraId) {
          clearCamera('face')
          setPhase('picking-camera')
          return
        }
        const isInsecure = !window.isSecureContext
        const msg =
          isInsecure
            ? 'Câmera só funciona em HTTPS ou localhost.'
            : err instanceof Error && err.name === 'NotAllowedError'
              ? 'Permissão da câmera negada.'
              : err instanceof Error && err.name === 'NotFoundError'
                ? 'Nenhuma câmera encontrada.'
                : err instanceof Error
                  ? `Erro: ${err.message}`
                  : 'Erro desconhecido ao iniciar.'
        setError(msg)
        setPhase('error')
      }
    })()

    return () => {
      alive = false
      localStream?.getTracks().forEach(t => t.stop())
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [restartTick, cameraId, clearCamera])

  // ── Loop de detecção ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'scanning') return
    const video = videoRef.current
    const overlay = overlayRef.current
    const detector = detectorRef.current
    if (!video || !overlay || !detector) return

    const tick = () => {
      if (!videoRef.current || video.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const { videoWidth: w, videoHeight: h } = video
      if (overlay.width !== w) overlay.width = w
      if (overlay.height !== h) overlay.height = h

      const ctx = overlay.getContext('2d')!
      ctx.clearRect(0, 0, w, h)

      let advance = false
      const now = performance.now()
      try {
        const { detections } = detector.detectForVideo(video, now)

        if (detections.length === 0) {
          setHint('Posicione o rosto no centro')
          drawFrameGuide(ctx, w, h, 'idle')
        } else if (detections.length > 1) {
          setHint('Mais de um rosto detectado — aproxime apenas um')
          for (const d of detections) drawFace(ctx, d, 'warn')
        } else {
          const d = detections[0]
          const box = d.boundingBox
          const score = d.categories?.[0]?.score ?? 0
          if (!box) {
            drawFrameGuide(ctx, w, h, 'idle')
          } else {
            const ratio = box.width / w
            if (ratio < MIN_FACE_RATIO) {
              setHint('Aproxime-se mais da câmera')
              drawFace(ctx, d, 'warn')
            } else if (ratio > MAX_FACE_RATIO) {
              setHint('Afaste-se um pouco')
              drawFace(ctx, d, 'warn')
            } else if (score < MIN_SCORE) {
              setHint('Ilumine melhor o rosto')
              drawFace(ctx, d, 'warn')
            } else {
              // Guarda o bbox pro crop acontecer exatamente onde o rosto
              // estava quando a captura disparar.
              lastBoxRef.current = box
              // Começa a contar o tempo estável. Se já começou antes, usa o
              // timestamp salvo pra manter o progresso contínuo.
              if (stableRef.current === 0) stableRef.current = now
              const elapsed = now - stableRef.current
              const progress = Math.min(elapsed / STABLE_HOLD_MS, 1)
              setHint(progress < 0.6 ? 'Segure o rosto parado...' : 'Mantenha firme...')
              drawFace(ctx, d, 'good', progress)
              advance = true
            }
          }
        }
      } catch { /* erro transiente do detector — continua */ }

      if (advance) {
        if (now - stableRef.current >= STABLE_HOLD_MS) {
          doCapture()
          return
        }
      } else {
        stableRef.current = 0
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Captura ─────────────────────────────────────────────────────────
  const doCapture = useCallback(() => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return

    const vw = video.videoWidth
    const vh = video.videoHeight

    // Canvas com o frame completo.
    const frame = document.createElement('canvas')
    frame.width = vw
    frame.height = vh
    frame.getContext('2d')!.drawImage(video, 0, 0)

    let dataUrl: string
    const box = lastBoxRef.current

    if (mode === 'enroll' && box) {
      // Foto de perfil — recorta em quadrado ao redor do rosto com margem
      // generosa (cabeça inteira + ombros), sem exagerar. Esse recorte
      // fecha o foco no paciente e vira o thumbnail do prontuário.
      const pad = 0.45  // 45% de margem relativa ao tamanho do rosto
      const padX = box.width * pad
      const padY = box.height * pad
      // Centraliza um quadrado de lado = maior dimensão (largura ou altura
      // do rosto + padding), tudo computado ao redor do centro da face.
      const cx = box.originX + box.width / 2
      const cy = box.originY + box.height / 2
      let side = Math.max(box.width + padX * 2, box.height + padY * 2)
      // Não pode ser maior que o próprio frame — se for, já sai quadrado
      // garantido pelo min(vw, vh).
      side = Math.min(side, Math.min(vw, vh))
      let sx = cx - side / 2
      let sy = cy - side / 2
      // Se o quadrado extrapolar as bordas, empurra pra dentro mantendo o
      // lado (NÃO corta o lado — isso é o que distorcia antes).
      if (sx < 0) sx = 0
      if (sy < 0) sy = 0
      if (sx + side > vw) sx = vw - side
      if (sy + side > vh) sy = vh - side
      const sw = side
      const sh = side

      // Saída fixa em 640×640 — bom pro backend indexar e pro thumbnail
      // ficar nítido sem inflar muito o upload. A imagem fica no
      // orientation original; o preview em <img> aplica scaleX(-1) pra
      // mostrar como selfie mas o arquivo real não é espelhado.
      const out = document.createElement('canvas')
      out.width = 640
      out.height = 640
      const octx = out.getContext('2d')!
      octx.drawImage(frame, sx, sy, sw, sh, 0, 0, out.width, out.height)
      dataUrl = out.toDataURL('image/jpeg', 0.92)
    } else {
      // Modo match: mantém frame inteiro (backend espera enxergar mais
      // contexto pra comparar).
      dataUrl = frame.toDataURL('image/jpeg', 0.92)
    }

    setCaptured(dataUrl)
    setPhase('captured')
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [mode])

  const handleRetake = () => {
    setCaptured(null)
    stableRef.current = 0
    setRestartTick(t => t + 1)
  }

  const handleUse = async () => {
    if (!captured) return
    if (mode === 'enroll') {
      onCapture?.(captured)
      onClose()
      return
    }
    // mode === 'match': envia ao backend, espera candidatos.
    setPhase('matching')
    try {
      const { faceApi, dataUrlToBlob } = await import('../../../api/face')
      const blob = dataUrlToBlob(captured)
      const resp = await faceApi.match(blob)
      onMatched?.(resp.candidates)
      onClose()
    } catch (err) {
      console.error('[FaceRecognition] match failed:', err)
      const msg = err instanceof Error ? err.message : 'Erro ao consultar o servidor.'
      setError(msg)
      setPhase('error')
    }
  }

  const handlePickCamera = (deviceId: string) => {
    setCameraPref('face', deviceId)
    stableRef.current = 0
    setRestartTick(t => t + 1)
  }

  const openPicker = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setPhase('picking-camera')
  }

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
            <ScanFace size={16} className="text-primary" />
            <h3 className="text-sm font-semibold">
              {phase === 'captured' ? 'Rosto capturado' : 'Reconhecimento facial'}
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
              Carregando reconhecedor... (primeira vez baixa ~2 MB)
            </Status>
          )}
          {phase === 'loading-camera' && (
            <Status icon={<Loader2 size={18} className="animate-spin" />}>
              Abrindo câmera...
            </Status>
          )}
          {phase === 'error' && (
            <Status icon={<AlertCircle size={18} className="text-rose-400" />}>
              {error ?? 'Erro desconhecido.'}
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
              <CameraPicker selectedId={cameraId} onSelect={handlePickCamera} />
            </div>
          )}

          {(phase === 'scanning' || phase === 'loading-camera') && (
            <>
              <video
                ref={videoRef}
                playsInline muted
                className="w-full h-full object-contain"
                // Espelha quando frontal — comportamento esperado de selfie.
                style={{ transform: 'scaleX(-1)' }}
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ transform: 'scaleX(-1)' }}
              />
              {phase === 'scanning' && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs flex items-center gap-2">
                  <ScanFace size={12} /> {hint}
                </div>
              )}
            </>
          )}

          {phase === 'captured' && captured && (
            <img src={captured} alt="Rosto capturado"
              className="w-full h-full object-contain bg-black"
              style={{ transform: 'scaleX(-1)' }} />
          )}

          {phase === 'matching' && captured && (
            <>
              <img src={captured} alt="Rosto capturado"
                className="w-full h-full object-contain bg-black opacity-40"
                style={{ transform: 'scaleX(-1)' }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-sm font-medium">Procurando paciente...</p>
                <p className="text-xs text-white/70">Comparando com a base do município</p>
              </div>
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-muted/30">
          {phase === 'scanning' && (
            <>
              <button
                type="button"
                onClick={openPicker}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted"
                title="Trocar câmera"
              >
                <SwitchCamera size={12} /> Trocar câmera
              </button>
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
                {mode === 'match'
                  ? <><ScanFace size={14} /> Identificar paciente</>
                  : <><Check size={14} /> Usar esta foto</>}
              </button>
            </>
          )}
          {(phase === 'loading-libs' || phase === 'loading-camera' || phase === 'picking-camera' || phase === 'matching' || phase === 'error') && (
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

// ─── Desenho ─────────────────────────────────────────────────────────────

function drawFace(
  ctx: CanvasRenderingContext2D,
  d: FaceDetection,
  status: 'good' | 'warn',
  progress = 0,
) {
  const box = d.boundingBox
  if (!box) return

  const { originX, originY, width, height } = box
  const colors = {
    good: { stroke: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.12)' },
    warn: { stroke: 'rgb(250, 204, 21)', fill: 'rgba(250, 204, 21, 0.08)' },
  }[status]

  // Retângulo principal arredondado.
  roundRect(ctx, originX, originY, width, height, 16)
  ctx.fillStyle = colors.fill
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = colors.stroke
  ctx.stroke()

  // Cantos acentuados (estilo visor)
  const arm = Math.min(width, height) * 0.12
  ctx.lineWidth = 6
  ctx.strokeStyle = colors.stroke
  corners(ctx, originX, originY, width, height, arm)

  // Anel de progresso quando good.
  if (status === 'good' && progress > 0) {
    const cx = originX + width / 2
    const cy = originY + height / 2
    const r = Math.min(width, height) / 2 + 12
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
    ctx.strokeStyle = 'rgb(22, 163, 74)'
    ctx.lineWidth = 4
    ctx.stroke()
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function corners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, arm: number) {
  ctx.beginPath(); ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + w - arm, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + arm); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + w, y + h - arm); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - arm, y + h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + arm, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - arm); ctx.stroke()
}

/** Guia neutra quando nenhum rosto está enquadrado — círculo central. */
function drawFrameGuide(ctx: CanvasRenderingContext2D, w: number, h: number, _status: 'idle') {
  const cx = w / 2, cy = h / 2
  const r = Math.min(w, h) * 0.28
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.lineWidth = 3
  ctx.setLineDash([14, 10])
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  void _status
}

function Status({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 text-white/80 text-sm text-center px-4">
      {icon}
      <p>{children}</p>
    </div>
  )
}
