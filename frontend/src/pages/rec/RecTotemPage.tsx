// Visão do totem (tablet/TV com touchscreen) do módulo Recepção.
//
// Só layout — ainda sem backend. A câmera e a busca por CPF/CNS são
// mockadas. Foco no fluxo de UX:
//
// - Fullscreen real (API do browser). Ao abrir, pergunta ao user se quer
//   entrar em modo tela cheia — ideal quando o tablet vai ficar na
//   parede/bancada com o paciente usando.
// - "Truque" de saída: 5 toques rápidos no canto superior esquerdo (zona
//   invisível de 60×60) dentro de 2s → destrava um menu com opção de sair
//   do fullscreen e voltar pra tela admin. Paciente casual não descobre.
// - Timeout de inatividade de 30s em qualquer passo resetando pra tela
//   inicial — se o paciente desistir, não deixa dados a meio caminho.
// - "Voltar" em todos os passos (exceto saudação) como botão grande no
//   rodapé, ao lado do CTA principal.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, Check, ChevronRight, Clock, Delete, Loader2, Maximize,
  ScanFace, User, UserCheck, X,
} from 'lucide-react'
import { HttpError } from '../../api/client'
import {
  recApi, type EmitTicketOutput, type FaceCandidate,
} from '../../api/rec'
import { useDeviceStore } from '../../store/deviceStore'
import { cn } from '../../lib/utils'

// ─── Máquina de estados ──────────────────────────────────────────────────────

type TotemStep =
  | 'greeting'
  | 'capture'
  | 'match_confirm'
  | 'document_input'
  | 'name_input'
  | 'priority'
  | 'success'
  | 'already_in_queue'

/** Dados mínimos do paciente pra UI do totem. Pode vir de:
 *  (a) match facial (patientId + máscaras vindas do backend);
 *  (b) digitação manual (só nome, sem patientId). */
interface TotemPatient {
  patientId?: string
  name: string
  socialName?: string
  cpfMasked?: string | null
  cnsMasked?: string | null
  /** Quando o face-match detecta que o paciente já tem atendimento
   *  ativo, o totem pula a prioridade e mostra "já está na fila". */
  activeTicket?: {
    ticketNumber: string
    sameFacility: boolean
    facilityShortName: string
  }
}

const IDLE_RESET_MS = 30_000
const ADMIN_UNLOCK_TAPS = 5
const ADMIN_UNLOCK_WINDOW_MS = 2_000
/** Confiança mínima pra o totem perguntar "você é X?" automaticamente.
 *  Abaixo disso (ou >1 candidato) cai no fluxo CPF/CNS pra não induzir
 *  o paciente a confirmar o nome errado. */
const FACE_MATCH_MIN_SIMILARITY = 0.60

// ─── Página ──────────────────────────────────────────────────────────────────

export function RecTotemPage() {
  const navigate = useNavigate()
  const deviceToken = useDeviceStore(s => s.deviceToken)
  const [step, setStep] = useState<TotemStep>('greeting')
  const [patient, setPatient] = useState<TotemPatient | null>(null)
  const [docValue, setDocValue] = useState('')
  const [docType, setDocType] = useState<'cpf' | 'cns'>('cpf')
  const [nameInput, setNameInput] = useState('')
  const [priority, setPriority] = useState<'normal' | 'priority' | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  // Foto capturada pela câmera — guardamos pra:
  //   1) mandar pro face-match,
  //   2) se o paciente vier confirmado (face OU doc), mandar pro enroll
  //      (learning: enriquece a base de fotos do paciente).
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null)
  // Retorno do backend quando a senha é emitida com sucesso.
  const [emitted, setEmitted] = useState<EmitTicketOutput | null>(null)
  // Quando `already_in_queue`: senha existente vinda do 409.
  const [existingTicket, setExistingTicket] = useState<string | null>(null)
  // Mensagem de erro genérica pra exibir no step success (ou fallback).
  const [emitError, setEmitError] = useState<string | null>(null)
  // Enquanto o POST está em voo.
  const [emitting, setEmitting] = useState(false)
  // Garante que o learning facial roda no máximo 1x por visita — mesmo
  // que o fluxo passe por confirmação facial E depois emissão (ambos
  // têm patientId conhecido).
  const enrollAttempted = useRef(false)
  // Info do rodapé — uma requisição só no mount, depois fica em memória.
  const [facilityInfo, setFacilityInfo] = useState<{
    facilityName: string
    municipalityName: string
    municipalityUf: string
  } | null>(null)
  useEffect(() => {
    if (!deviceToken) return
    recApi.deviceFacilityInfo(deviceToken)
      .then(info => setFacilityInfo({
        facilityName: info.facilityName,
        municipalityName: info.municipalityName,
        municipalityUf: info.municipalityUf,
      }))
      .catch(() => { /* sem rodapé, não é crítico */ })
  }, [deviceToken])

  const reset = useCallback(() => {
    setStep('greeting')
    setPatient(null)
    setDocValue('')
    setDocType('cpf')
    setNameInput('')
    setPriority(null)
    setCapturedPhoto(null)
    setEmitted(null)
    setExistingTicket(null)
    setEmitError(null)
    setEmitting(false)
    enrollAttempted.current = false
  }, [])

  /** Fire-and-forget: vincula a foto capturada ao paciente (learning). */
  const enrollPhoto = useCallback((patientId: string) => {
    if (enrollAttempted.current) return
    if (!capturedPhoto || !deviceToken) return
    enrollAttempted.current = true
    void recApi.faceEnroll(deviceToken, patientId, capturedPhoto)
      .catch(() => { /* best-effort */ })
  }, [capturedPhoto, deviceToken])

  /**
   * Chama ``POST /rec/tickets`` com os dados coletados e decide o step
   * final: ``success`` (senha emitida), ``already_in_queue`` (409 —
   * mostra a senha existente), ou volta com erro.
   *
   * Depois de emitir com sucesso, se temos uma foto capturada E o
   * backend resolveu um ``patientId``, dispara o ``faceEnroll`` em
   * background (best-effort — falha não afeta o totem).
   */
  const emitTicket = useCallback(async (chosenPriority: boolean) => {
    if (!deviceToken) {
      setEmitError('Totem não está pareado. Chame o suporte.')
      setStep('success')
      return
    }
    setEmitting(true)
    setEmitError(null)
    try {
      // Decide identidade:
      //   - Se paciente confirmado por face match → patientId
      //     (backend resolve CPF/CNS do cadastro, evita expor em tela).
      //   - Senão, CPF/CNS digitado;
      //   - Caso contrário, cadastro manual só com nome.
      let docTypeOut: 'cpf' | 'cns' | 'manual' = 'manual'
      let docValueOut: string | null = null
      const patientIdOut = patient?.patientId ?? null
      if (!patientIdOut && docValue) {
        docTypeOut = docType
        docValueOut = docValue.replace(/\D/g, '')
      }
      const out = await recApi.emitTicket(deviceToken, {
        docType: docTypeOut,
        docValue: docValueOut,
        patientName: (patient?.name || nameInput || 'Anônimo').trim(),
        priority: chosenPriority,
        patientId: patientIdOut,
      })
      setEmitted(out)
      setStep('success')

      // Learning facial — fire-and-forget, no-op se já enrollou no
      // match_confirm (mesma visita).
      if (out.patientId) enrollPhoto(out.patientId)
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        // Já existe atendimento ativo aqui — details tem a senha existente
        const d = e.details
        setExistingTicket(
          (d && typeof d.existingTicket === 'string') ? d.existingTicket : null,
        )
        setStep('already_in_queue')
      } else {
        const msg = e instanceof HttpError ? e.message : 'Falha ao emitir senha.'
        setEmitError(msg)
        setStep('success')  // exibe o erro dentro do mesmo card
      }
    } finally {
      setEmitting(false)
    }
  }, [deviceToken, patient, docType, docValue, nameInput, capturedPhoto])

  // ── Fullscreen ────────────────────────────────────────────────────────
  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen()
      setFullscreen(true)
    } catch { /* usuário negou — continua normal */ }
  }, [])

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch { /* ignore */ }
    setFullscreen(false)
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ── Destrave admin (5 toques canto sup esq em 2s) ─────────────────────
  const unlockTapsRef = useRef<number[]>([])
  const handleUnlockTap = () => {
    const now = Date.now()
    const recent = unlockTapsRef.current.filter(t => now - t < ADMIN_UNLOCK_WINDOW_MS)
    recent.push(now)
    unlockTapsRef.current = recent
    if (recent.length >= ADMIN_UNLOCK_TAPS) {
      unlockTapsRef.current = []
      setAdminUnlocked(true)
    }
  }

  // ── Timeout de inatividade ────────────────────────────────────────────
  const idleRef = useRef<number | null>(null)
  const resetIdleTimer = useCallback(() => {
    if (idleRef.current) window.clearTimeout(idleRef.current)
    // A tela inicial não precisa resetar sozinha — já é o "neutro".
    if (step === 'greeting' || step === 'success' || step === 'already_in_queue') return
    idleRef.current = window.setTimeout(reset, IDLE_RESET_MS)
  }, [step, reset])

  useEffect(() => {
    resetIdleTimer()
    return () => { if (idleRef.current) window.clearTimeout(idleRef.current) }
  }, [step, resetIdleTimer])

  // Telas "success" e "already_in_queue" voltam sozinhas em 5s.
  useEffect(() => {
    if (step !== 'success' && step !== 'already_in_queue') return
    const t = window.setTimeout(reset, 5000)
    return () => window.clearTimeout(t)
  }, [step, reset])

  return (
    <div
      onPointerDown={resetIdleTimer}
      className="fixed inset-0 z-[60] bg-gradient-to-br from-sky-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col select-none"
    >
      {/* Zona invisível de destrave admin — canto sup esquerdo */}
      <div
        onPointerDown={handleUnlockTap}
        className="absolute top-0 left-0 w-16 h-16 z-30"
        aria-hidden
      />

      {/* Conteúdo principal */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        {step === 'greeting' && (
          <Greeting
            onIdentify={() => setStep('capture')}
            onAnonymous={() => setStep('priority')}
            fullscreen={fullscreen}
            onEnterFullscreen={enterFullscreen}
          />
        )}
        {step === 'capture' && (
          <Capture
            deviceToken={deviceToken}
            onMatched={(cand, photo) => {
              setCapturedPhoto(photo)
              setPatient({
                patientId: cand.patientId,
                name: cand.name,
                socialName: cand.socialName ?? undefined,
                cpfMasked: cand.cpfMasked,
                cnsMasked: cand.cnsMasked,
                activeTicket: cand.activeTicket ? {
                  ticketNumber: cand.activeTicket.ticketNumber,
                  sameFacility: cand.activeTicket.sameFacility,
                  facilityShortName: cand.activeTicket.facilityShortName,
                } : undefined,
              })
              setStep('match_confirm')
            }}
            onNoMatch={(photo) => {
              setCapturedPhoto(photo)
              setStep('document_input')
            }}
            onBack={() => setStep('greeting')}
          />
        )}
        {step === 'match_confirm' && patient && (
          <MatchConfirm
            patient={patient}
            onYes={() => {
              // Identidade confirmada via face match → dispara enroll
              // agora, independente do que vem depois. Assim a base de
              // fotos cresce mesmo quando o paciente já está na fila.
              if (patient.patientId) enrollPhoto(patient.patientId)

              // Se o face-match já trouxe que o paciente tem atendimento
              // ativo nesta unidade, pula prioridade e mostra direto que
              // ele já está na fila — sem emitir senha duplicada.
              if (patient.activeTicket?.sameFacility) {
                setExistingTicket(patient.activeTicket.ticketNumber)
                setStep('already_in_queue')
                return
              }
              setStep('priority')
            }}
            onNo={() => { setPatient(null); setStep('document_input') }}
            onBack={() => { setPatient(null); setStep('greeting') }}
          />
        )}
        {step === 'document_input' && (
          <DocumentInput
            value={docValue}
            type={docType}
            onChangeValue={setDocValue}
            onChangeType={setDocType}
            onConfirm={() => setStep('name_input')}
            onBack={() => setStep('greeting')}
          />
        )}
        {step === 'name_input' && (
          <NameInput
            value={nameInput}
            onChange={setNameInput}
            onConfirm={() => {
              setPatient({ name: nameInput.trim() })
              setStep('priority')
            }}
            onBack={() => setStep('document_input')}
          />
        )}
        {step === 'priority' && (
          <PrioritySelect
            onSelect={p => {
              setPriority(p)
              void emitTicket(p === 'priority')
            }}
            onBack={() => setStep(patient ? 'greeting' : 'greeting')}
          />
        )}
        {step === 'success' && (
          <SuccessScreen
            patient={patient}
            priority={priority}
            emitted={emitted}
            emitting={emitting}
            error={emitError}
            onDismiss={reset}
          />
        )}
        {step === 'already_in_queue' && (
          <AlreadyInQueue
            patient={patient}
            existingTicket={existingTicket}
            onDismiss={reset}
          />
        )}
      </div>

      {/* Rodapé — nome da unidade + município (vem do backend via device). */}
      {step === 'greeting' && facilityInfo && (
        <footer className="px-6 py-3 text-center text-xs uppercase tracking-wider text-slate-400 dark:text-slate-600">
          {facilityInfo.facilityName} · {facilityInfo.municipalityName}/{facilityInfo.municipalityUf}
        </footer>
      )}

      {/* Modal admin (aparece após destravar) */}
      {adminUnlocked && (
        <AdminExitModal
          fullscreen={fullscreen}
          onExitFullscreen={async () => { await exitFullscreen() }}
          onLeaveTotem={async () => { await exitFullscreen(); navigate('/rec') }}
          onClose={() => setAdminUnlocked(false)}
        />
      )}
    </div>
  )
}

// ─── Saudação ────────────────────────────────────────────────────────────────

function Greeting({
  onIdentify, onAnonymous, fullscreen, onEnterFullscreen,
}: {
  onIdentify: () => void
  onAnonymous: () => void
  fullscreen: boolean
  onEnterFullscreen: () => void
}) {
  // useNow é puro client-side (setInterval + Date local). Zero requisições.
  // 15s é um bom balanço entre reatividade (virada de hora/minuto) e CPU.
  const now = useNow(15_000)
  const greeting = greetingFor(now.getHours())
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (
    <>
      <div className="w-full max-w-2xl text-center">
        <p className="text-lg sm:text-xl text-slate-500 dark:text-slate-400 mb-2 capitalize">
          {dateStr} · {timeStr}
        </p>
        <h1 className="text-5xl sm:text-7xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {greeting}!
        </h1>
        <p className="text-xl sm:text-2xl text-slate-600 dark:text-slate-300 mt-4 mb-12">
          Toque para começar seu atendimento
        </p>

        <div className="grid gap-4 sm:gap-5">
          <BigButton
            onClick={onIdentify}
            variant="primary"
            icon={<ScanFace size={32} />}
            title="Me identificar"
            subtitle="Foto, CPF ou CNS — atendimento mais rápido"
          />
          <BigButton
            onClick={onAnonymous}
            variant="secondary"
            icon={<User size={28} />}
            title="Continuar sem identificar"
            subtitle="Você completa seus dados na recepção"
          />
        </div>
      </div>

      {/* Call-to-setup de tela cheia — discreto mas visível enquanto não
          ativar. Some quando o totem já está em fullscreen. */}
      {!fullscreen && (
        <FullscreenSetupPill onClick={onEnterFullscreen} />
      )}
    </>
  )
}

function FullscreenSetupPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-20 group inline-flex items-center gap-2.5 pl-4 pr-5 py-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold shadow-lg shadow-black/20 hover:shadow-xl transition-all hover:-translate-y-0.5"
    >
      <span className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
        <Maximize size={16} />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] font-normal uppercase tracking-widest opacity-60">
          Modo Apresentação
        </span>
        <span>Ativar tela cheia</span>
      </span>
    </button>
  )
}

// ─── Câmera (auto-captura via MediaPipe) ─────────────────────────────────────
//
// Mesmo detector usado no FaceRecognitionModal do HSP: MediaPipe
// FaceDetector roda no vídeo ao vivo, e quando detecta um rosto único e
// bem enquadrado por STABLE_HOLD_MS (1s), dispara a captura sozinho.
// Sem botão "Tirar foto" — totem é pra ser hands-off pro paciente.

interface MpFaceDetection {
  boundingBox?: { originX: number; originY: number; width: number; height: number }
  categories?: Array<{ score: number }>
}
interface MpFaceDetectorInstance {
  detectForVideo: (video: HTMLVideoElement, ts: number) => { detections: MpFaceDetection[] }
  close: () => void
}

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const FACE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'

const STABLE_HOLD_MS = 1000
const MIN_FACE_RATIO = 0.18
const MAX_FACE_RATIO = 0.85
const MIN_DETECTION_SCORE = 0.7

let _detectorPromise: Promise<MpFaceDetectorInstance> | null = null

async function loadFaceDetector(): Promise<MpFaceDetectorInstance> {
  if (_detectorPromise) return _detectorPromise
  _detectorPromise = (async () => {
    const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(FACE_WASM_URL)
    return await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: MIN_DETECTION_SCORE,
    }) as unknown as MpFaceDetectorInstance
  })().catch(err => {
    _detectorPromise = null
    throw err
  })
  return _detectorPromise
}

function Capture({
  deviceToken, onMatched, onNoMatch, onBack,
}: {
  deviceToken: string | null
  onMatched: (candidate: FaceCandidate, photo: Blob) => void
  onNoMatch: (photo: Blob | null) => void
  onBack: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<MpFaceDetectorInstance | null>(null)
  const stableRef = useRef(0)
  const capturedRef = useRef(false)  // evita disparar captura 2x no loop

  const [phase, setPhase] = useState<
    'loading-libs' | 'loading-camera' | 'scanning' | 'matching' | 'no-match' | 'denied'
  >('loading-libs')
  const [hint, setHint] = useState('Posicione o rosto no centro')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Guarda a foto capturada pra passar pro onNoMatch depois do delay
  // da tela "não identificamos".
  const noMatchBlobRef = useRef<Blob | null>(null)

  // ── Setup: carrega detector + abre câmera ─────────────────────────
  useEffect(() => {
    let alive = true
    let localStream: MediaStream | null = null

    ;(async () => {
      try {
        const detector = await loadFaceDetector()
        if (!alive) return
        detectorRef.current = detector

        if (alive) setPhase('loading-camera')
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (!alive) { localStream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = localStream
        const v = videoRef.current
        if (v) {
          v.srcObject = localStream
          await new Promise<void>(resolve => {
            if (v.readyState >= 1) return resolve()
            v.onloadedmetadata = () => resolve()
          })
          await v.play().catch(() => { /* autoplay pode falhar */ })
        }
        if (alive) setPhase('scanning')
      } catch (e) {
        if (!alive) return
        localStream?.getTracks().forEach(t => t.stop())
        const err = e instanceof Error ? e : new Error(String(e))
        const isInsecure = !window.isSecureContext
        const msg =
          isInsecure
            ? 'Câmera só funciona em HTTPS ou localhost.'
            : err.name === 'NotAllowedError'
              ? 'Permissão da câmera negada.'
              : err.name === 'NotFoundError'
                ? 'Nenhuma câmera encontrada.'
                : err.message || 'Erro ao iniciar câmera.'
        setErrorMsg(msg)
        setPhase('denied')
      }
    })()

    return () => {
      alive = false
      localStream?.getTracks().forEach(t => t.stop())
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  // ── Captura (auto) ─────────────────────────────────────────────────
  const doAutoCapture = useCallback(async () => {
    if (capturedRef.current) return
    capturedRef.current = true
    const v = videoRef.current
    if (!v || v.videoWidth === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9))

    // Pausa a câmera assim que pegou o frame — libera hardware.
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    if (!blob) {
      noMatchBlobRef.current = null
      setPhase('no-match')
      return
    }
    if (!deviceToken) {
      noMatchBlobRef.current = blob
      setPhase('no-match')
      return
    }
    setPhase('matching')
    try {
      const resp = await recApi.faceMatch(deviceToken, blob)
      const best = resp.candidates[0]
      const uniqueMatch =
        resp.faceDetected
        && resp.candidates.length === 1
        && best
        && best.similarity >= FACE_MATCH_MIN_SIMILARITY
      if (uniqueMatch) {
        onMatched(best, blob)
      } else {
        noMatchBlobRef.current = blob
        setPhase('no-match')
      }
    } catch {
      noMatchBlobRef.current = blob
      setPhase('no-match')
    }
  }, [deviceToken, onMatched])

  // ── Tela "não te conheço" — auto-advance em 3.5s (ou via botão) ──
  useEffect(() => {
    if (phase !== 'no-match') return
    const t = window.setTimeout(() => {
      onNoMatch(noMatchBlobRef.current)
    }, 3500)
    return () => window.clearTimeout(t)
  }, [phase, onNoMatch])

  // ── Loop de detecção ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'scanning') return
    const video = videoRef.current
    const overlay = overlayRef.current
    const detector = detectorRef.current
    if (!video || !overlay || !detector) return

    const tick = () => {
      if (capturedRef.current) return
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
          drawGuideCircle(ctx, w, h)
        } else if (detections.length > 1) {
          setHint('Mais de uma pessoa — aproxime apenas um rosto')
          for (const d of detections) drawBox(ctx, d, 'warn')
        } else {
          const d = detections[0]
          const box = d.boundingBox
          const score = d.categories?.[0]?.score ?? 0
          if (!box) {
            drawGuideCircle(ctx, w, h)
          } else {
            const ratio = box.width / w
            if (ratio < MIN_FACE_RATIO) {
              setHint('Aproxime-se mais da câmera')
              drawBox(ctx, d, 'warn')
            } else if (ratio > MAX_FACE_RATIO) {
              setHint('Afaste-se um pouco')
              drawBox(ctx, d, 'warn')
            } else if (score < MIN_DETECTION_SCORE) {
              setHint('Ilumine melhor o rosto')
              drawBox(ctx, d, 'warn')
            } else {
              if (stableRef.current === 0) stableRef.current = now
              const elapsed = now - stableRef.current
              const progress = Math.min(elapsed / STABLE_HOLD_MS, 1)
              setHint(progress < 0.6 ? 'Segure firme…' : 'Quase lá…')
              drawBox(ctx, d, 'good', progress)
              advance = true
            }
          }
        }
      } catch { /* detector transiente — segue */ }

      if (advance && now - stableRef.current >= STABLE_HOLD_MS) {
        void doAutoCapture()
        return
      }
      if (!advance) stableRef.current = 0

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [phase, doAutoCapture])

  // ── Fallback sem câmera ────────────────────────────────────────────
  if (phase === 'denied') {
    return (
      <StepShell title="Identificação por foto">
        <div className="flex flex-col items-center gap-6 w-full max-w-xl text-center">
          <div className="w-24 h-24 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
            <AlertCircle size={48} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Câmera indisponível
            </p>
            {errorMsg && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{errorMsg}</p>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Vamos seguir pelo seu CPF ou CNS.
            </p>
          </div>
          <button
            onClick={() => onNoMatch(null)}
            className="w-full px-6 py-5 rounded-2xl text-lg font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors inline-flex items-center justify-center gap-2"
          >
            Continuar <ChevronRight size={22} />
          </button>
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium inline-flex items-center gap-1 transition-colors"
          >
            <ArrowLeft size={14} /> Voltar
          </button>
        </div>
      </StepShell>
    )
  }

  // ── Tela "não te conheço ainda" ────────────────────────────────────
  // UX warm — não é erro, é convite. Animação sutil e CTA pra prosseguir.
  if (phase === 'no-match') {
    return (
      <StepShell title="Quase lá">
        <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-xl text-center">
          <div className="relative w-32 h-32 sm:w-40 sm:h-40">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-100 to-indigo-100 dark:from-sky-950 dark:to-indigo-950 animate-[ping_2s_ease-in-out_infinite] opacity-70" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-sky-500/30">
              <ScanFace size={64} className="text-white" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Ainda não te conheço
            </h2>
            <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
              Tudo bem! Vamos te identificar pelo
              {' '}<span className="font-semibold text-slate-900 dark:text-white">CPF</span> ou
              {' '}<span className="font-semibold text-slate-900 dark:text-white">CNS</span>.
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md mx-auto">
              Na próxima visita o totem já te reconhece na hora. ✨
            </p>
          </div>
          <button
            onClick={() => onNoMatch(noMatchBlobRef.current)}
            className="w-full px-6 py-5 rounded-2xl text-lg font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
          >
            Continuar <ChevronRight size={22} />
          </button>
        </div>
      </StepShell>
    )
  }

  return (
    <StepShell title="Identificação por foto">
      <div className="flex flex-col items-center gap-6 w-full max-w-xl">
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center border-4 border-sky-400/40">
          <video
            ref={videoRef}
            playsInline muted autoPlay
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ transform: 'scaleX(-1)' }}
          />
          {(phase === 'loading-libs' || phase === 'loading-camera') && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
              <Loader2 size={64} className="text-white animate-spin" />
            </div>
          )}
          {phase === 'matching' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3 text-white">
                <Loader2 size={56} className="animate-spin" />
                <p className="text-sm font-medium">Identificando…</p>
              </div>
            </div>
          )}
        </div>
        <p className="text-lg text-slate-600 dark:text-slate-300 text-center min-h-[3rem]">
          {phase === 'loading-libs' && 'Carregando reconhecedor…'}
          {phase === 'loading-camera' && 'Abrindo câmera…'}
          {phase === 'scanning' && hint}
          {phase === 'matching' && 'Comparando com os cadastros…'}
        </p>
        {phase !== 'matching' && (
          <>
            <button
              onClick={() => onNoMatch(null)}
              className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              Pular e usar CPF/CNS
            </button>
            <button
              onClick={onBack}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium inline-flex items-center gap-1 transition-colors"
            >
              <ArrowLeft size={14} /> Voltar
            </button>
          </>
        )}
      </div>
    </StepShell>
  )
}

// ── Overlay helpers (bbox + ring de progresso) ─────────────────────────

function drawBox(
  ctx: CanvasRenderingContext2D,
  d: MpFaceDetection,
  status: 'good' | 'warn',
  progress = 0,
) {
  const box = d.boundingBox
  if (!box) return
  const { originX, originY, width, height } = box
  const colors = status === 'good'
    ? { stroke: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.12)' }
    : { stroke: 'rgb(250, 204, 21)', fill: 'rgba(250, 204, 21, 0.08)' }

  roundRect(ctx, originX, originY, width, height, 16)
  ctx.fillStyle = colors.fill; ctx.fill()
  ctx.lineWidth = 4; ctx.strokeStyle = colors.stroke; ctx.stroke()

  const arm = Math.min(width, height) * 0.12
  ctx.lineWidth = 6; ctx.strokeStyle = colors.stroke
  drawCorners(ctx, originX, originY, width, height, arm)

  if (status === 'good' && progress > 0) {
    const cx = originX + width / 2
    const cy = originY + height / 2
    const r = Math.min(width, height) / 2 + 12
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
    ctx.strokeStyle = 'rgb(22, 163, 74)'; ctx.lineWidth = 4; ctx.stroke()
  }
}

function drawGuideCircle(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const r = Math.min(w, h) * 0.28
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.lineWidth = 3
  ctx.setLineDash([14, 10])
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
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

function drawCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, arm: number) {
  ctx.beginPath(); ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + w - arm, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + arm); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + w, y + h - arm); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - arm, y + h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + arm, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - arm); ctx.stroke()
}

// ─── Confirmar identidade ────────────────────────────────────────────────────

function MatchConfirm({
  patient, onYes, onNo, onBack,
}: {
  patient: TotemPatient
  onYes: () => void
  onNo: () => void
  onBack: () => void
}) {
  const deviceToken = useDeviceStore(s => s.deviceToken)
  const display = patient.socialName || patient.name
  const firstName = display.split(' ')[0]

  // Busca foto do cadastro pra exibir na confirmação. Fallback: ícone.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!patient.patientId || !deviceToken) return
    let revoked = false
    let url: string | null = null
    ;(async () => {
      try {
        const blob = await recApi.patientPhoto(deviceToken, patient.patientId!)
        if (revoked) return
        url = URL.createObjectURL(blob)
        setPhotoUrl(url)
      } catch { /* sem foto — usa ícone */ }
    })()
    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [patient.patientId, deviceToken])

  return (
    <StepShell title="Confirmação">
      <div className="text-center space-y-8 w-full max-w-xl">
        <div className="w-40 h-40 mx-auto rounded-full overflow-hidden bg-sky-100 dark:bg-sky-950 flex items-center justify-center ring-4 ring-sky-400/40 shadow-xl shadow-sky-500/20">
          {photoUrl ? (
            <img src={photoUrl} alt={display} className="w-full h-full object-cover" />
          ) : (
            <UserCheck size={72} className="text-sky-600 dark:text-sky-400" />
          )}
        </div>
        <div>
          <p className="text-xl text-slate-500 dark:text-slate-400">Você é</p>
          <p className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mt-2">
            {firstName}?
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">{display}</p>
          {(patient.cpfMasked || patient.cnsMasked) && (
            <div className="mt-4 inline-flex flex-col items-center gap-1 text-sm text-slate-500 dark:text-slate-400 font-mono">
              {patient.cpfMasked && <span>CPF {patient.cpfMasked}</span>}
              {patient.cnsMasked && <span>CNS {patient.cnsMasked}</span>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onNo}
            className="px-6 py-5 rounded-2xl text-lg font-semibold border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Não sou eu
          </button>
          <button
            onClick={onYes}
            className="px-6 py-5 rounded-2xl text-lg font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            Sim, sou eu
          </button>
        </div>
        <FooterActions onBack={onBack} backLabel="Começar de novo" />
      </div>
    </StepShell>
  )
}

// ─── CPF/CNS ─────────────────────────────────────────────────────────────────

function DocumentInput({
  value, type, onChangeValue, onChangeType, onConfirm, onBack,
}: {
  value: string
  type: 'cpf' | 'cns'
  onChangeValue: (v: string) => void
  onChangeType: (t: 'cpf' | 'cns') => void
  onConfirm: () => void
  onBack: () => void
}) {
  const masked = type === 'cpf' ? maskCpf(value) : maskCns(value)
  const digits = value.replace(/\D/g, '')
  const maxLen = type === 'cpf' ? 11 : 15
  const ready = digits.length === maxLen

  const appendDigit = (d: string) => {
    if (digits.length >= maxLen) return
    onChangeValue(digits + d)
  }
  const backspace = () => onChangeValue(digits.slice(0, -1))
  const clear = () => onChangeValue('')

  return (
    <StepShell title="Informe seu documento">
      <div className="space-y-5 max-w-md w-full">
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
          <button
            onClick={() => { onChangeType('cpf'); onChangeValue('') }}
            className={cn(
              'py-3 rounded-xl text-base font-semibold transition-colors',
              type === 'cpf' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow' : 'text-slate-500',
            )}
          >
            CPF
          </button>
          <button
            onClick={() => { onChangeType('cns'); onChangeValue('') }}
            className={cn(
              'py-3 rounded-xl text-base font-semibold transition-colors',
              type === 'cns' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow' : 'text-slate-500',
            )}
          >
            CNS
          </button>
        </div>

        {/* Display só-leitura — OS keyboard NÃO abre. */}
        <div className="w-full text-center text-3xl sm:text-4xl font-mono font-semibold py-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 min-h-[84px] flex items-center justify-center break-all tracking-wide">
          {masked || (
            <span className="text-slate-300 dark:text-slate-700">
              {type === 'cpf' ? '000.000.000-00' : '000 0000 0000 0000'}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 text-center">
          {digits.length}/{maxLen} dígitos
        </p>

        <NumericKeypad
          onDigit={appendDigit}
          onBackspace={backspace}
          onClear={clear}
        />

        <FooterActions
          onBack={onBack}
          primary={{
            label: 'Continuar',
            icon: <ChevronRight size={22} />,
            onClick: onConfirm,
            disabled: !ready,
          }}
        />
      </div>
    </StepShell>
  )
}

// ─── Cadastro rápido ─────────────────────────────────────────────────────────

function NameInput({
  value, onChange, onConfirm, onBack,
}: {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const ready = value.trim().length >= 3

  const appendChar = (c: string) => {
    // Auto-capitaliza o primeiro de cada palavra. Nunca deixa dois
    // espaços seguidos.
    if (c === ' ' && (value.endsWith(' ') || value.length === 0)) return
    const shouldCapitalize = value.length === 0 || value.endsWith(' ')
    onChange(value + (shouldCapitalize && c !== ' ' ? c.toUpperCase() : c))
  }
  const backspace = () => onChange(value.slice(0, -1))

  return (
    <StepShell title="Confirmação">
      <div className="space-y-5 max-w-3xl w-full text-center">
        <p className="text-xl text-slate-500 dark:text-slate-400">
          Como você se chama?
        </p>
        <div className="w-full text-center text-2xl sm:text-3xl font-semibold py-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 min-h-[84px] flex items-center justify-center px-4">
          {value || <span className="text-slate-300 dark:text-slate-700">Seu nome completo</span>}
        </div>

        <AlphaKeyboard
          onChar={appendChar}
          onBackspace={backspace}
          canConfirm={ready}
          onConfirm={onConfirm}
        />

        <FooterActions
          onBack={onBack}
          primary={{
            label: 'Continuar',
            icon: <ChevronRight size={22} />,
            onClick: onConfirm,
            disabled: !ready,
          }}
        />
        <p className="text-xs text-slate-400">
          A recepção completa seus dados depois.
        </p>
      </div>
    </StepShell>
  )
}

// ─── Prioridade ──────────────────────────────────────────────────────────────

function PrioritySelect({
  onSelect, onBack,
}: { onSelect: (p: 'normal' | 'priority') => void; onBack: () => void }) {
  return (
    <StepShell title="Tipo de atendimento">
      <div className="w-full max-w-2xl grid gap-4 sm:gap-5">
        <BigButton
          onClick={() => onSelect('normal')}
          variant="secondary"
          icon={<User size={32} />}
          title="Atendimento normal"
          subtitle="Fila comum"
        />
        <BigButton
          onClick={() => onSelect('priority')}
          variant="primary"
          icon={<UserCheck size={32} />}
          title="Atendimento prioritário"
          subtitle="Idoso 60+, gestante, pessoa com deficiência, mãe com bebê de colo"
        />
        <FooterActions onBack={onBack} />
      </div>
    </StepShell>
  )
}

// ─── Sucesso ─────────────────────────────────────────────────────────────────

function SuccessScreen({
  patient, priority, emitted, emitting, error, onDismiss,
}: {
  patient: TotemPatient | null
  priority: 'normal' | 'priority' | null
  emitted: EmitTicketOutput | null
  emitting: boolean
  error: string | null
  onDismiss: () => void
}) {
  const [sec, setSec] = useState(10)
  useEffect(() => {
    if (sec <= 0) return
    if (emitting) return
    const id = window.setTimeout(() => setSec(s => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [sec, emitting])

  const displayName = emitted?.patientName || patient?.socialName || patient?.name
  const firstName = displayName ? displayName.split(' ')[0] : ''
  const ticket = emitted?.ticketNumber
  const ticketColor =
    (emitted?.priority || priority === 'priority') ? '#dc2626' : '#0d9488'

  // Estado: emitindo, erro genérico, ou emitido
  if (emitting) {
    return (
      <div className="text-center space-y-5 max-w-xl w-full">
        <div className="w-24 h-24 mx-auto rounded-full bg-sky-100 dark:bg-sky-950 flex items-center justify-center">
          <Loader2 size={48} className="text-sky-600 dark:text-sky-400 animate-spin" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">
          Emitindo sua senha…
        </h2>
      </div>
    )
  }

  if (error || !emitted) {
    return (
      <div className="text-center space-y-6 max-w-xl w-full">
        <div className="w-24 h-24 mx-auto rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
          <X size={56} className="text-red-600 dark:text-red-400" />
        </div>
        <div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
            Não foi possível emitir sua senha
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 mt-3">
            {error || 'Tente novamente ou procure a recepção.'}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="w-full py-5 rounded-2xl text-lg font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors"
        >
          OK
        </button>
      </div>
    )
  }

  return (
    <div className="text-center space-y-6 max-w-xl w-full">
      <div className="w-24 h-24 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
        <Check size={56} className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white">
          {firstName ? `Tudo certo, ${firstName}!` : 'Tudo certo!'}
        </h2>
        <p className="text-lg text-slate-500 dark:text-slate-400 mt-3">
          {emitted.handover
            ? `Você já tinha atendimento aberto em ${emitted.handover.facilityShortName}. Procure a recepção pra confirmar sua presença aqui.`
            : 'Aguarde ser chamado.'}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <p className="text-sm text-slate-400">Sua senha</p>
        <p className="text-5xl sm:text-6xl font-extrabold tracking-widest font-mono"
           style={{ color: ticketColor }}>
          {ticket}
        </p>
      </div>

      <button
        onClick={onDismiss}
        className="w-full py-5 rounded-2xl text-lg font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors"
      >
        OK, entendi ({sec}s)
      </button>
    </div>
  )
}

function AlreadyInQueue({
  patient, existingTicket, onDismiss,
}: {
  patient: TotemPatient | null
  existingTicket: string | null
  onDismiss: () => void
}) {
  const [sec, setSec] = useState(8)
  useEffect(() => {
    if (sec <= 0) return
    const id = window.setTimeout(() => setSec(s => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [sec])
  const firstName = patient?.name ? patient.name.split(' ')[0] : ''
  return (
    <div className="text-center space-y-6 max-w-xl w-full">
      <div className="w-24 h-24 mx-auto rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
        <Clock size={56} className="text-amber-600 dark:text-amber-400" />
      </div>
      <div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
          {firstName ? `${firstName},` : ''} você já está na fila.
        </h2>
        <p className="text-lg text-slate-500 dark:text-slate-400 mt-3">
          Sua senha foi emitida anteriormente. Aguarde ser chamado.
        </p>
      </div>
      {existingTicket && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-700 p-6">
          <p className="text-sm text-slate-400">Sua senha</p>
          <p className="text-5xl sm:text-6xl font-extrabold tracking-widest font-mono text-sky-500">
            {existingTicket}
          </p>
        </div>
      )}
      <button
        onClick={onDismiss}
        className="w-full py-5 rounded-2xl text-lg font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors"
      >
        OK ({sec}s)
      </button>
    </div>
  )
}

// ─── Compartilhados ──────────────────────────────────────────────────────────

function StepShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-3xl flex flex-col items-center gap-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {title}
      </p>
      {children}
    </div>
  )
}

function FooterActions({
  onBack,
  backLabel = 'Voltar',
  backDisabled,
  primary,
}: {
  onBack?: () => void
  backLabel?: string
  backDisabled?: boolean
  primary?: { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean }
}) {
  if (!onBack && !primary) return null
  return (
    <div className={cn('w-full grid gap-3 pt-2', primary && onBack ? 'grid-cols-[auto_1fr]' : 'grid-cols-1')}>
      {onBack && (
        <button
          onClick={onBack}
          disabled={backDisabled}
          className="px-5 py-5 rounded-2xl text-base sm:text-lg font-semibold border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
        >
          <ArrowLeft size={20} /> {backLabel}
        </button>
      )}
      {primary && (
        <button
          onClick={primary.onClick}
          disabled={primary.disabled}
          className="px-6 py-5 rounded-2xl text-lg font-semibold bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors inline-flex items-center justify-center gap-2"
        >
          {primary.label}
          {primary.icon}
        </button>
      )}
    </div>
  )
}

function BigButton({
  onClick, variant, icon, title, subtitle,
}: {
  onClick: () => void
  variant: 'primary' | 'secondary'
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-4 rounded-3xl text-left transition-colors px-6 sm:px-8 py-5 sm:py-6',
        variant === 'primary'
          ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/20'
          : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border-2 border-slate-200 dark:border-slate-700',
      )}
    >
      <span className={cn(
        'shrink-0 flex items-center justify-center rounded-2xl w-16 h-16 sm:w-20 sm:h-20',
        variant === 'primary' ? 'bg-white/20' : 'bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400',
      )}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-2xl sm:text-3xl">{title}</span>
        {subtitle && (
          <span className={cn(
            'block mt-1 text-sm sm:text-base',
            variant === 'primary' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400',
          )}>
            {subtitle}
          </span>
        )}
      </span>
      <ChevronRight size={28} className="shrink-0 opacity-60" />
    </button>
  )
}

// ─── Teclados virtuais (touchscreen) ─────────────────────────────────────────

function NumericKeypad({
  onDigit, onBackspace, onClear,
}: {
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear: () => void
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
      {keys.map(k => (
        <KeyButton key={k} onClick={() => onDigit(k)}>
          <span className="text-3xl font-semibold">{k}</span>
        </KeyButton>
      ))}
      <KeyButton variant="muted" onClick={onClear} title="Limpar">
        <span className="text-sm font-semibold">Limpar</span>
      </KeyButton>
      <KeyButton onClick={() => onDigit('0')}>
        <span className="text-3xl font-semibold">0</span>
      </KeyButton>
      <KeyButton variant="muted" onClick={onBackspace} title="Apagar">
        <Delete size={26} />
      </KeyButton>
    </div>
  )
}

function AlphaKeyboard({
  onChar, onBackspace, canConfirm, onConfirm,
}: {
  onChar: (c: string) => void
  onBackspace: () => void
  canConfirm: boolean
  onConfirm: () => void
}) {
  // Linha fina de acentos mais comuns em PT-BR. Fica sempre visível pra
  // evitar UX de "segurar a tecla" (que é ruim em tablet barato).
  const accents = ['Á','Â','Ã','À','É','Ê','Í','Ó','Ô','Õ','Ú']
  const row1 = ['Q','W','E','R','T','Y','U','I','O','P']
  const row2 = ['A','S','D','F','G','H','J','K','L','Ç']
  const row3 = ['Z','X','C','V','B','N','M']
  return (
    <div className="w-full space-y-1 sm:space-y-1.5 landscape:space-y-2">
      {/* Linha de acentos — teclas menores, altura reduzida */}
      <KeyboardRow>
        {accents.map(k => (
          <button
            key={k}
            onClick={() => onChar(k)}
            className="flex-1 min-w-0 h-9 landscape:h-11 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-base landscape:text-lg font-medium transition-colors active:scale-95"
          >
            {k}
          </button>
        ))}
      </KeyboardRow>
      <KeyboardRow>
        {row1.map(k => <LetterKey key={k} char={k} onClick={onChar} />)}
      </KeyboardRow>
      <KeyboardRow>
        {row2.map(k => <LetterKey key={k} char={k} onClick={onChar} />)}
      </KeyboardRow>
      <KeyboardRow>
        {row3.map(k => <LetterKey key={k} char={k} onClick={onChar} />)}
        <KeyButton variant="muted" onClick={onBackspace} title="Apagar" className="flex-[1.5]">
          <Delete size={22} />
        </KeyButton>
      </KeyboardRow>
      <KeyboardRow>
        <KeyButton variant="muted" onClick={() => onChar(' ')} className="flex-[5]">
          <span className="text-sm landscape:text-base font-medium">Espaço</span>
        </KeyButton>
        <KeyButton
          variant="primary"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="flex-[2]"
        >
          <span className="text-sm landscape:text-base font-semibold inline-flex items-center gap-1">
            <Check size={16} /> Pronto
          </span>
        </KeyButton>
      </KeyboardRow>
    </div>
  )
}

function KeyboardRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1 sm:gap-1.5 w-full justify-center">{children}</div>
}

function LetterKey({ char, onClick }: { char: string; onClick: (c: string) => void }) {
  return (
    <KeyButton onClick={() => onClick(char)} className="flex-1 min-w-0">
      <span className="text-lg sm:text-xl font-semibold">{char}</span>
    </KeyButton>
  )
}

function KeyButton({
  children, onClick, variant = 'default', className, disabled, title,
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'muted' | 'primary'
  className?: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-12 sm:h-14 rounded-xl transition-colors active:scale-95 active:brightness-90 flex items-center justify-center',
        variant === 'default' && 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100',
        variant === 'muted' && 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300',
        variant === 'primary' && 'bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ─── Modal admin ─────────────────────────────────────────────────────────────

function AdminExitModal({
  fullscreen, onExitFullscreen, onLeaveTotem, onClose,
}: {
  fullscreen: boolean
  onExitFullscreen: () => void
  onLeaveTotem: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Painel do administrador</h2>
            <p className="text-xs text-slate-500 mt-1">
              Destravado via sequência de toques. Escolha uma ação ou feche.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          {fullscreen && (
            <button
              onClick={() => { onExitFullscreen() }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Maximize size={16} />
              Sair da tela cheia
            </button>
          )}
          <button
            onClick={() => { onLeaveTotem() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            Sair do modo totem
          </button>
        </div>

        <p className="text-[11px] text-slate-400 mt-4 text-center">
          Pressione novamente 5× o canto superior esquerdo quando precisar destravar.
        </p>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date())
  const ref = useRef<number | null>(null)
  useEffect(() => {
    ref.current = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => { if (ref.current) window.clearInterval(ref.current) }
  }, [intervalMs])
  return useMemo(() => now, [now])
}

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  if (hour >= 18 && hour < 23) return 'Boa noite'
  return 'Boa madrugada'
}

function maskCpf(v: string): string {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskCns(v: string): string {
  return v.replace(/\D/g, '').slice(0, 15)
    .replace(/(\d{3})(\d)/, '$1 $2')
    .replace(/(\d{3} \d{4})(\d)/, '$1 $2')
    .replace(/(\d{3} \d{4} \d{4})(\d)/, '$1 $2')
}
