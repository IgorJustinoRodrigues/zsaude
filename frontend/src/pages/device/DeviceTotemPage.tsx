// URL pública ``/dispositivo/totem``:
// - sem deviceToken: mostra tela de pareamento
// - com token mas sem config vinculada: tela "aguardando configuração"
// - com config: renderiza o totem operacional (RecTotemPage)

import { useDeviceStore } from '../../store/deviceStore'
import { useDeviceSocket } from '../../hooks/useDeviceSocket'
import { useDeviceConfig } from '../../hooks/useDeviceConfig'
import { DevicePairingScreen } from './DevicePairingScreen'
import { DeviceWaitingConfigScreen } from './DeviceWaitingConfigScreen'
import { RecTotemPage } from '../rec/RecTotemPage'

export function DeviceTotemPage() {
  const { deviceToken, type, deviceId, reset } = useDeviceStore()
  const { config, loading } = useDeviceConfig()

  useDeviceSocket({
    onEvent: ({ event, payload }) => {
      if (event === 'device:revoked' && payload.deviceId === deviceId) {
        reset()
      }
    },
    onUnauthorized: () => reset(),
  })

  if (!deviceToken || type !== 'totem') {
    return <DevicePairingScreen type="totem" />
  }
  if (loading && !config) {
    return <DeviceWaitingConfigScreen type="totem" deviceName={null} />
  }
  if (!config?.totem) {
    return <DeviceWaitingConfigScreen type="totem" deviceName={config?.name ?? null} />
  }
  return <RecTotemPage />
}
