// URL pública ``/dispositivo/painel``.

import { useDeviceStore } from '../../store/deviceStore'
import { useDeviceSocket } from '../../hooks/useDeviceSocket'
import { useDeviceConfig } from '../../hooks/useDeviceConfig'
import { usePainelAnnouncer } from '../../hooks/usePainelAnnouncer'
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

  // Áudio (Web Speech API) — desligado por padrão, ligado via config.
  usePainelAnnouncer({
    enabled: config?.painel?.announceAudio ?? false,
    mode: config?.painel?.mode ?? 'senha',
    call: currentCall,
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
  return <RecPainelPage />
}
