// URL pública ``/dispositivo/painel``.

import { useCallback, useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { useDeviceStore } from '../../store/deviceStore'
import { useDeviceSocket } from '../../hooks/useDeviceSocket'
import { useDeviceConfig } from '../../hooks/useDeviceConfig'
import { usePainelAnnouncer } from '../../hooks/usePainelAnnouncer'
import { usePainelTtsAnnouncer, useSilenceTtsAnnouncer } from '../../hooks/usePainelTtsAnnouncer'
import { useAudioQueue } from '../../hooks/useAudioQueue'
import { useLiveCallStore } from '../../store/liveCallStore'
import { DevicePairingScreen } from './DevicePairingScreen'
import { DeviceWaitingConfigScreen } from './DeviceWaitingConfigScreen'
import { RecPainelPage } from '../rec/RecPainelPage'

export function DevicePainelPage() {
  const { deviceToken, type, deviceId, reset } = useDeviceStore()
  const { config, loading } = useDeviceConfig()
  const pushCall = useLiveCallStore(s => s.push)
  const currentCall = useLiveCallStore(s => s.current)
  const advanceCall = useLiveCallStore(s => s.advance)
  const abortAllCalls = useLiveCallStore(s => s.abortAll)
  const requestSilence = useLiveCallStore(s => s.requestSilence)
  const silenceAt = useLiveCallStore(s => s.silenceAt)

  const painelMode = (config?.painel?.mode as 'senha' | 'nome' | 'ambos' | undefined) ?? 'senha'
  const announceAudio = config?.painel?.announceAudio ?? false
  const repeatCount = config?.painel?.repeatCount ?? 1
  const silenceEnabled = config?.painel?.silenceEnabled ?? true
  const silenceMessage = config?.painel?.silenceMessage ?? 'Por favor, silêncio na recepção.'

  // Fila de áudio TTS — enfileira sem cortar a chamada anterior.
  const queue = useAudioQueue({ volume: 1 })

  // Silêncio solicitado → descarta chamadas em fila, para o áudio atual,
  // e o useSilenceTtsAnnouncer vai enfileirar a mensagem de silêncio.
  useEffect(() => {
    if (silenceAt) {
      queue.clear()
      abortAllCalls()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silenceAt])

  // Flag que liga pro fallback quando o TTS backend falha.
  const [fallbackCall, setFallbackCall] = useState<typeof currentCall>(null)
  const handleFallback = useCallback((c: NonNullable<typeof currentCall>) => {
    setFallbackCall(c)
  }, [])

  // Voz configurada (vem do rec_config do escopo).
  const voiceId = config?.painel?.voiceId ?? null

  // TTS real (ElevenLabs/Google).
  usePainelTtsAnnouncer({
    enabled: announceAudio,
    mode: painelMode,
    call: currentCall,
    queue,
    deviceToken,
    voiceId,
    repeatCount,
    onFallback: handleFallback,
    onDone: advanceCall,
  })

  // TTS de silêncio — dispara quando recepção clica "Solicitar silêncio".
  useSilenceTtsAnnouncer({
    enabled: announceAudio && silenceEnabled,
    message: silenceMessage,
    queue,
    deviceToken,
    voiceId,
    silenceAt,
  })

  // Fallback: Web Speech API (liga só se TTS falhou pra esta call).
  usePainelAnnouncer({
    enabled: announceAudio && !!fallbackCall,
    mode: painelMode,
    call: fallbackCall,
  })

  // Sem áudio: o announcer não roda, então a fila travaria em ``current``.
  // Esse efeito segura a chamada por 8s visualmente e avança.
  useEffect(() => {
    if (announceAudio) return
    if (!currentCall) return
    const t = window.setTimeout(() => advanceCall(), 8_000)
    return () => window.clearTimeout(t)
  }, [announceAudio, currentCall, advanceCall])

  useDeviceSocket({
    onEvent: ({ event, payload }) => {
      if (event === 'device:revoked' && payload.deviceId === deviceId) {
        reset()
        return
      }
      if (event === 'painel:silence') {
        requestSilence()
        return
      }
      if (event === 'painel:call') {
        // Filtra por setor se o painel vinculado limitou os setores a exibir.
        const sectorNames = config?.painel?.sectorNames ?? []
        const sector = typeof payload.sector === 'string' ? payload.sector : null
        if (sectorNames.length > 0 && sector && !sectorNames.includes(sector)) {
          return
        }
        pushCall({
          ticket: String(payload.ticket ?? ''),
          counter: String(payload.counter ?? ''),
          patientName: (payload.patientName as string | null | undefined) ?? null,
          priority: Boolean(payload.priority),
          at: new Date(),
        })
      }
    },
    onUnauthorized: () => reset(),
  })

  // Splash "Iniciar" pra desbloquear autoplay ANTES da primeira chamada
  // chegar. Fica até o usuário tocar uma vez; depois some pra sempre
  // enquanto a aba estiver aberta.
  const [audioPrimed, setAudioPrimed] = useState(false)

  if (!deviceToken || type !== 'painel') {
    return <DevicePairingScreen type="painel" />
  }
  if (loading && !config) {
    return <DeviceWaitingConfigScreen type="painel" deviceName={null} />
  }
  if (!config?.painel) {
    return <DeviceWaitingConfigScreen type="painel" deviceName={config?.name ?? null} />
  }

  if (!audioPrimed && announceAudio) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center text-white animate-[fadeIn_0.3s_ease-out] p-8">
        <div className="relative w-32 h-32 mb-10">
          <span className="absolute inset-0 rounded-full bg-sky-400/30 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-xl shadow-sky-500/30">
            <Volume2 size={64} strokeWidth={1.8} />
          </span>
        </div>
        <p className="text-3xl sm:text-5xl font-bold mb-4 text-center">Painel de Chamadas</p>
        <p className="text-base sm:text-xl text-white/70 mb-10 text-center max-w-md">
          Toque no botão abaixo pra ativar o áudio do painel. É só uma vez —
          depois ele chama sozinho.
        </p>
        <button
          onClick={() => {
            queue.prime()
            setAudioPrimed(true)
          }}
          className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-sky-500 hover:bg-sky-600 active:scale-[0.98] text-white text-2xl font-bold transition-all shadow-lg shadow-sky-500/40"
        >
          <Volume2 size={28} /> Iniciar
        </button>
      </div>
    )
  }

  return <RecPainelPage mode={painelMode} />
}
