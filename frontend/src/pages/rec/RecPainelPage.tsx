// Painel de chamadas (TV pública) — layout básico e mockado.
//
// A tela é pensada pra uma TV na parede da recepção: conteúdo enorme,
// contraste forte, sem interação do paciente. Mostra:
//
// - Chamada atual (senha gigante + guichê)
// - Unidade/horário no topo
// - Histórico das últimas chamadas na lateral
//
// Sem backend ainda: um timer faz "chamadas" aleatórias a cada ~8s
// pra demonstrar a animação/som.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Maximize, X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Call {
  id: string
  ticket: string    // ex.: "R-047" ou "P-012"
  counter: string   // ex.: "Guichê 1" / "Sala 3"
  patientName: string | null
  priority: boolean
  at: Date
}

const MOCK_CALLS_INITIAL: Call[] = [
  { id: '3', ticket: 'R-045', counter: 'Guichê 2', patientName: 'Carla M.',     priority: false, at: new Date(Date.now() - 3 * 60 * 1000) },
  { id: '2', ticket: 'P-011', counter: 'Guichê 1', patientName: 'Raimundo O.',  priority: true,  at: new Date(Date.now() - 2 * 60 * 1000) },
  { id: '1', ticket: 'R-046', counter: 'Guichê 3', patientName: 'Joana da S.',  priority: false, at: new Date(Date.now() - 1 * 60 * 1000) },
]

const ADMIN_UNLOCK_TAPS = 5
const ADMIN_UNLOCK_WINDOW_MS = 2_000

export function RecPainelPage() {
  const navigate = useNavigate()
  const [fullscreen, setFullscreen] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [current, setCurrent] = useState<Call>(MOCK_CALLS_INITIAL[MOCK_CALLS_INITIAL.length - 1])
  const [history, setHistory] = useState<Call[]>(MOCK_CALLS_INITIAL.slice(0, -1))
  const [flash, setFlash] = useState(true)

  // Mock: emite uma chamada nova a cada 8s pra demonstrar. Troca por
  // fonte real (SSE/WS) quando o back entrar.
  useEffect(() => {
    const id = window.setInterval(() => {
      const priority = Math.random() < 0.25
      const nextNum = Math.floor(40 + Math.random() * 50)
      const next: Call = {
        id: String(Date.now()),
        ticket: `${priority ? 'P' : 'R'}-${String(nextNum).padStart(3, '0')}`,
        counter: `Guichê ${1 + Math.floor(Math.random() * 3)}`,
        patientName: Math.random() < 0.7 ? fakeName() : null,
        priority,
        at: new Date(),
      }
      setHistory(h => [current, ...h].slice(0, 4))
      setCurrent(next)
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1500)
    }, 8_000)
    return () => window.clearInterval(id)
  }, [current])

  // Fullscreen + unlock admin (mesma receita do totem)
  const enterFullscreen = useCallback(async () => {
    try { await document.documentElement.requestFullscreen(); setFullscreen(true) }
    catch { /* ignora */ }
  }, [])
  const exitFullscreen = useCallback(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen() }
    catch { /* ignora */ }
    setFullscreen(false)
  }, [])
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

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

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col text-slate-900 select-none overflow-hidden">
      {/* Zona invisível de destrave admin — canto sup esquerdo */}
      <div
        onPointerDown={handleUnlockTap}
        className="absolute top-0 left-0 w-16 h-16 z-30"
        aria-hidden
      />

      {/* Header */}
      <header className="flex items-center justify-between px-8 sm:px-12 py-5 shrink-0">
        <p className="text-sm sm:text-base font-medium text-slate-500 truncate">
          Centro de Saúde Arturo Bermurdez Mayorga · Goianésia/GO
        </p>
        <ClockBlock />
      </header>

      {/* Conteúdo */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 sm:px-12 overflow-hidden">
        <p className={cn(
          'text-xs sm:text-sm uppercase tracking-[0.4em] mb-2 transition-colors',
          flash ? 'text-teal-600' : 'text-slate-400',
        )}>
          {flash ? 'Chamando' : 'Última chamada'}
        </p>
        <div
          className={cn(
            'text-[22vw] landscape:text-[16vw] font-black leading-none tracking-tight tabular-nums transition-transform',
            flash && 'scale-[1.02]',
          )}
          style={{ color: current.priority ? '#dc2626' : '#0d9488' }}
        >
          {current.ticket}
        </div>
        <p className="mt-6 text-4xl sm:text-6xl font-semibold text-slate-800">
          {current.counter}
        </p>
        {current.patientName && (
          <p className="mt-2 text-xl sm:text-2xl text-slate-500">
            {current.patientName}
          </p>
        )}
      </main>

      {/* Histórico — faixa no rodapé */}
      <footer className="shrink-0 border-t border-slate-200 px-6 sm:px-10 py-4 flex items-center gap-6 overflow-x-auto">
        {history.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Sem chamadas anteriores.</p>
        ) : (
          history.map(h => (
            <div key={h.id} className="flex items-baseline gap-3 shrink-0">
              <span
                className="text-2xl sm:text-3xl font-black tabular-nums"
                style={{ color: h.priority ? '#dc2626' : '#0d9488' }}
              >
                {h.ticket}
              </span>
              <span className="text-sm text-slate-500">{h.counter}</span>
              <span className="text-xs text-slate-400">{timeAgo(h.at)}</span>
            </div>
          ))
        )}
      </footer>

      {/* Pill de tela cheia */}
      {!fullscreen && (
        <button
          onClick={enterFullscreen}
          className="fixed bottom-5 right-5 z-20 group inline-flex items-center gap-2.5 pl-4 pr-5 py-3 rounded-full bg-teal-600 text-white text-sm font-semibold shadow-lg shadow-teal-900/20 hover:shadow-xl transition-all hover:-translate-y-0.5"
        >
          <span className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Maximize size={16} />
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[10px] font-normal uppercase tracking-widest opacity-75">
              Modo TV
            </span>
            <span>Ativar tela cheia</span>
          </span>
        </button>
      )}

      {/* Modal admin */}
      {adminUnlocked && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 text-slate-900 dark:text-white">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold">Painel do administrador</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Destravado via sequência de toques.
                </p>
              </div>
              <button onClick={() => setAdminUnlocked(false)} className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2">
              {fullscreen && (
                <button
                  onClick={exitFullscreen}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Maximize size={16} />
                  Sair da tela cheia
                </button>
              )}
              <button
                onClick={async () => { await exitFullscreen(); navigate('/rec') }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
              >
                <ArrowLeft size={16} />
                Sair do painel
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 text-center">
              5× no canto superior esquerdo pra destravar quando precisar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Relógio do header ───────────────────────────────────────────────────────

function ClockBlock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (
    <p className="text-2xl sm:text-3xl font-semibold tabular-nums tracking-tight text-slate-700">
      {timeStr}
    </p>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return `${sec}s atrás`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}min atrás`
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fakeName(): string {
  const names = ['Maria A.', 'João B.', 'Ana C.', 'Pedro D.', 'Luiza E.', 'Ricardo F.', 'Helena G.', 'Bruno H.']
  return names[Math.floor(Math.random() * names.length)]
}
