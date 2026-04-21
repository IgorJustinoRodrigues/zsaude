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
  ArrowLeft, Camera, Check, ChevronRight, Clock, Delete, Maximize,
  ScanFace, User, UserCheck, X,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ─── Máquina de estados ──────────────────────────────────────────────────────

type TotemStep =
  | 'greeting'
  | 'capture'
  | 'match_confirm'
  | 'document_input'
  | 'document_result'
  | 'name_input'
  | 'priority'
  | 'success'
  | 'already_in_queue'

interface MockPatient {
  name: string
  socialName?: string
  cpf?: string
  cns?: string
}

const MOCK_PATIENTS: MockPatient[] = [
  { name: 'Igor Rodrigues',          cpf: '04099448150', cns: '706508120941352' },
  { name: 'Maria da Silva Oliveira', cpf: '12345678900', cns: '898000000000002' },
]

const IDLE_RESET_MS = 30_000
const ADMIN_UNLOCK_TAPS = 5
const ADMIN_UNLOCK_WINDOW_MS = 2_000

// ─── Página ──────────────────────────────────────────────────────────────────

export function RecTotemPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<TotemStep>('greeting')
  const [patient, setPatient] = useState<MockPatient | null>(null)
  const [docValue, setDocValue] = useState('')
  const [docType, setDocType] = useState<'cpf' | 'cns'>('cpf')
  const [nameInput, setNameInput] = useState('')
  const [priority, setPriority] = useState<'normal' | 'priority' | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(false)

  const reset = useCallback(() => {
    setStep('greeting')
    setPatient(null)
    setDocValue('')
    setDocType('cpf')
    setNameInput('')
    setPriority(null)
  }, [])

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
            onCaptured={match => {
              if (match) { setPatient(match); setStep('match_confirm') }
              else setStep('document_input')
            }}
            onBack={() => setStep('greeting')}
          />
        )}
        {step === 'match_confirm' && patient && (
          <MatchConfirm
            patient={patient}
            onYes={() => setStep('priority')}
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
            onConfirm={() => {
              const digits = docValue.replace(/\D/g, '')
              const found = MOCK_PATIENTS.find(p =>
                (docType === 'cpf' && p.cpf === digits)
                || (docType === 'cns' && p.cns === digits),
              )
              if (found) { setPatient(found); setStep('document_result') }
              else setStep('name_input')
            }}
            onBack={() => setStep('greeting')}
          />
        )}
        {step === 'document_result' && patient && (
          <MatchConfirm
            patient={patient}
            onYes={() => setStep('priority')}
            onNo={() => { setPatient(null); setStep('name_input') }}
            onBack={() => { setPatient(null); setStep('document_input') }}
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
              const alreadyInQueue = patient && Math.random() < 0.25
              setStep(alreadyInQueue ? 'already_in_queue' : 'success')
            }}
            onBack={() => setStep(patient ? 'greeting' : 'greeting')}
          />
        )}
        {step === 'success' && (
          <SuccessScreen patient={patient} priority={priority} onDismiss={reset} />
        )}
        {step === 'already_in_queue' && (
          <AlreadyInQueue patient={patient} onDismiss={reset} />
        )}
      </div>

      {/* Rodapé suave — instrução + cidade/unidade mock */}
      {step === 'greeting' && (
        <footer className="px-6 py-3 text-center text-xs text-slate-400 dark:text-slate-600">
          CENTRO DE SAÚDE ARTURO BERMURDEZ MAYORGA · Goianésia/GO
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
  const now = useNow(60_000)
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
          Modo tablet
        </span>
        <span>Ativar tela cheia</span>
      </span>
    </button>
  )
}

// ─── Câmera (mock) ───────────────────────────────────────────────────────────

function Capture({
  onCaptured, onBack,
}: {
  onCaptured: (match: MockPatient | null) => void
  onBack: () => void
}) {
  const [scanning, setScanning] = useState(false)
  const simulate = () => {
    setScanning(true)
    window.setTimeout(() => {
      const hit = Math.random() < 0.7 ? MOCK_PATIENTS[0] : null
      onCaptured(hit)
    }, 2000)
  }
  return (
    <StepShell title="Identificação por foto">
      <div className="flex flex-col items-center gap-8 w-full max-w-xl">
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center border-4 border-sky-400/40">
          {scanning ? (
            <>
              <div className="absolute inset-0 bg-gradient-to-b from-sky-500/0 via-sky-500/20 to-sky-500/0 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-4 border-sky-500 animate-ping" />
              </div>
              <ScanFace size={100} className="text-sky-600 dark:text-sky-400 relative z-10" />
            </>
          ) : (
            <Camera size={80} className="text-slate-400" />
          )}
        </div>
        <p className="text-lg text-slate-600 dark:text-slate-300 text-center">
          {scanning
            ? 'Olhe para a câmera, estamos identificando você…'
            : 'Posicione seu rosto e toque em "Tirar foto"'}
        </p>
        {!scanning && (
          <>
            <button
              onClick={simulate}
              className="w-full px-6 py-5 rounded-2xl text-lg font-semibold bg-sky-500 hover:bg-sky-600 text-white transition-colors inline-flex items-center justify-center gap-2"
            >
              <Camera size={24} /> Tirar foto
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

// ─── Confirmar identidade ────────────────────────────────────────────────────

function MatchConfirm({
  patient, onYes, onNo, onBack,
}: {
  patient: MockPatient
  onYes: () => void
  onNo: () => void
  onBack: () => void
}) {
  const display = patient.socialName || patient.name
  const firstName = display.split(' ')[0]
  return (
    <StepShell title="Confirmação">
      <div className="text-center space-y-8 w-full max-w-xl">
        <div className="w-32 h-32 mx-auto rounded-full bg-sky-100 dark:bg-sky-950 flex items-center justify-center">
          <UserCheck size={64} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <p className="text-xl text-slate-500 dark:text-slate-400">Você é</p>
          <p className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white mt-2">
            {firstName}?
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">{display}</p>
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
    <StepShell title="Cadastro rápido">
      <div className="space-y-5 max-w-3xl w-full text-center">
        <p className="text-xl text-slate-500 dark:text-slate-400">
          Não encontramos seu cadastro. Como você se chama?
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
  patient, priority, onDismiss,
}: { patient: MockPatient | null; priority: 'normal' | 'priority' | null; onDismiss: () => void }) {
  const [sec, setSec] = useState(5)
  useEffect(() => {
    if (sec <= 0) return
    const id = window.setTimeout(() => setSec(s => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [sec])

  const displayName = patient?.socialName || patient?.name
  const firstName = displayName ? displayName.split(' ')[0] : ''
  const ticket = priority === 'priority' ? 'P-012' : 'R-047'
  const position = priority === 'priority' ? 2 : 7
  const eta = priority === 'priority' ? '~5 min' : '~20 min'

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
          Aguarde ser chamado em uma das recepções.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div>
          <p className="text-sm text-slate-400">Sua senha</p>
          <p className="text-5xl sm:text-6xl font-extrabold tracking-widest font-mono"
             style={{ color: priority === 'priority' ? '#ef4444' : '#0ea5e9' }}>
            {ticket}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-xs text-slate-400">Posição</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {position}ª
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 flex items-center justify-end gap-1">
              <Clock size={11} /> Tempo estimado
            </p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {eta}
            </p>
          </div>
        </div>
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
  patient, onDismiss,
}: { patient: MockPatient | null; onDismiss: () => void }) {
  const [sec, setSec] = useState(5)
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
      <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-700 p-6">
        <p className="text-sm text-slate-400">Sua senha</p>
        <p className="text-5xl sm:text-6xl font-extrabold tracking-widest font-mono text-sky-500">
          R-032
        </p>
      </div>
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
