// URL pública ``/dispositivo/painel``.

import { useCallback, useEffect, useState } from 'react'
import { useDeviceStore } from '../../store/deviceStore'
import { useDeviceSocket } from '../../hooks/useDeviceSocket'
import { useDeviceConfig } from '../../hooks/useDeviceConfig'
import { usePainelAnnouncer } from '../../hooks/usePainelAnnouncer'
import { usePainelTtsAnnouncer } from '../../hooks/usePainelTtsAnnouncer'
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
  const requestSilence = useLiveCallStore(s => s.requestSilence)
  const silenceAt = useLiveCallStore(s => s.silenceAt)

  const painelMode = (config?.painel?.mode as 'senha' | 'nome' | 'ambos' | undefined) ?? 'senha'
  const announceAudio = config?.painel?.announceAudio ?? false

  // Fila de áudio TTS — enfileira sem cortar a chamada anterior.
  const queue = useAudioQueue({ volume: 1 })

  // Silêncio solicitado → limpa fila e para áudio em curso.
  useEffect(() => {
    if (silenceAt) queue.clear()
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
    onFallback: handleFallback,
  })

  // Fallback: Web Speech API (liga só se TTS falhou pra esta call).
  usePainelAnnouncer({
    enabled: announceAudio && !!fallbackCall,
    mode: painelMode,
    call: fallbackCall,
  })

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

  if (!deviceToken || type !== 'painel') {
    return <DevicePairingScreen type="painel" />
  }
  if (loading && !config) {
    return <DeviceWaitingConfigScreen type="painel" deviceName={null} />
  }
  if (!config?.painel) {
    return <DeviceWaitingConfigScreen type="painel" deviceName={config?.name ?? null} />
  }
  return <RecPainelPage mode={painelMode} />
}
