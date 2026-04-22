// Painel de chamadas (TV pública).
//
// Lê do ``useLiveCallStore`` — preenchido pelo DevicePainelPage quando
// recebe eventos ``painel:call`` via WebSocket. No console do balcão,
// o clique em "Chamar" vai até o backend, publica no Valkey, e o painel
// conectado à mesma unidade recebe.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Maximize, VolumeX, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useLiveCallStore, SILENCE_DURATION_MS } from '../../store/liveCallStore'

type PainelMode = 'senha' | 'nome' | 'ambos'

interface Props {
  /** Modo de exibição: só senha, só nome, ou ambos. Default "senha". */
  mode?: PainelMode
}

const ADMIN_UNLOCK_TAPS = 5
const ADMIN_UNLOCK_WINDOW_MS = 2_000

export function RecPainelPage({ mode = 'senha' }: Props = {}) {
  const navigate = useNavigate()
  const [fullscreen, setFullscreen] = useState(false)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const current = useLiveCallStore(s => s.current)
  const history = useLiveCallStore(s => s.history)
  const silenceAt = useLiveCallStore(s => s.silenceAt)
  const [flash, setFlash] = useState(false)
  const [silenceOn, setSilenceOn] = useState(false)

  // Mostra overlay de silêncio quando ``silenceAt`` é setado e auto-
  // dismisses depois de SILENCE_DURATION_MS.
  useEffect(() => {
    if (!silenceAt) return
    setSilenceOn(true)
    const t = window.setTimeout(() => setSilenceOn(false), SILENCE_DURATION_MS)
    return () => window.clearTimeout(t)
  }, [silenceAt])

  // Dispara flash visual toda vez que ``current`` muda (nova chamada).
  useEffect(() => {
    if (!current) return
    setFlash(true)
    const t = window.setTimeout(() => setFlash(false), 1500)
    return () => window.clearTimeout(t)
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
        {current ? (
          <>
            <p className={cn(
              'text-xs sm:text-sm uppercase tracking-[0.4em] mb-2 transition-colors',
              flash ? 'text-teal-600' : 'text-slate-400',
            )}>
              {flash ? 'Chamando' : 'Última chamada'}
            </p>

            {/* Modo SENHA: só número gigante.
                Modo NOME: nome gigante (fallback pro número se não tem).
                Modo AMBOS: NOME como destaque principal + senha menor
                acima como "etiqueta" da pessoa.
                Nome "Anônimo" (paciente não identificado) não entra —
                mostra só a senha. */}
            {mode === 'ambos' && hasRealName(current.patientName) ? (
              <>
                <div
                  className="text-3xl sm:text-5xl font-black tabular-nums opacity-80 mb-2"
                  style={{ color: current.priority ? '#dc2626' : '#0d9488' }}
                >
                  {current.ticket}
                </div>
                <div
                  className={cn(
                    'text-[10vw] landscape:text-[7vw] font-black leading-tight tracking-tight text-center max-w-[90vw] text-slate-900 transition-transform',
                    flash && 'scale-[1.02]',
                  )}
                >
                  {current.patientName}
                </div>
              </>
            ) : mode === 'nome' && hasRealName(current.patientName) ? (
              <div
                className={cn(
                  'text-[12vw] landscape:text-[9vw] font-black leading-tight tracking-tight text-center max-w-[90vw] transition-transform',
                  flash && 'scale-[1.02]',
                )}
                style={{ color: current.priority ? '#dc2626' : '#0d9488' }}
              >
                {current.patientName}
              </div>
            ) : (
              <div
                className={cn(
                  'text-[22vw] landscape:text-[16vw] font-black leading-none tracking-tight tabular-nums transition-transform',
                  flash && 'scale-[1.02]',
                )}
                style={{ color: current.priority ? '#dc2626' : '#0d9488' }}
              >
                {current.ticket}
              </div>
            )}

            {current.counter && (
              <p className="mt-6 text-4xl sm:text-6xl font-semibold text-slate-800">
                {current.counter}
              </p>
            )}
          </>
        ) : (
          <p className="text-2xl sm:text-4xl text-slate-400 italic">
            Aguardando próxima chamada…
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
              {mode === 'nome' && hasRealName(h.patientName) ? (
                <span
                  className="text-lg sm:text-xl font-bold truncate max-w-[28ch]"
                  style={{ color: h.priority ? '#dc2626' : '#0d9488' }}
                >
                  {h.patientName}
                </span>
              ) : (
                <>
                  <span
                    className="text-2xl sm:text-3xl font-black tabular-nums"
                    style={{ color: h.priority ? '#dc2626' : '#0d9488' }}
                  >
                    {h.ticket}
                  </span>
                  {mode === 'ambos' && hasRealName(h.patientName) && (
                    <span className="text-sm text-slate-600 truncate max-w-[24ch]">
                      {h.patientName}
                    </span>
                  )}
                </>
              )}
              {h.counter && <span className="text-sm text-slate-500">{h.counter}</span>}
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

      {/* Overlay de silêncio */}
      {silenceOn && (
        <div className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center animate-[fadeIn_0.25s_ease-out]">
          <div className="flex flex-col items-center text-white animate-[pop_0.4s_cubic-bezier(0.18,1.3,0.6,1)_forwards]">
            <div className="relative mb-8">
              <span className="absolute inset-0 rounded-full bg-white/10 animate-ping" />
              <span className="relative w-40 h-40 rounded-full bg-white/10 border-4 border-white/30 flex items-center justify-center">
                <VolumeX size={96} strokeWidth={1.8} />
              </span>
            </div>
            <p className="text-[12vw] landscape:text-[8vw] font-black tracking-tight leading-none">
              SILÊNCIO
            </p>
            <p className="text-2xl sm:text-4xl text-white/70 mt-4 font-light">
              por favor
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

/** Paciente sem identificação entra no totem como "Anônimo" — e não
 *  faz sentido anunciar pelo nome. Nesse caso voltamos pra exibir só a
 *  senha, mesmo que o modo global seja ``nome``/``ambos``. */
function hasRealName(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim().toLowerCase()
  if (!n) return false
  return n !== 'anônimo' && n !== 'anonimo'
}

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return `${sec}s atrás`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}min atrás`
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

