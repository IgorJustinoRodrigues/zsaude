// URL pública ``/dispositivo/totem``:
// - sem deviceToken: mostra tela de pareamento
// - com deviceToken: mostra a mesma UX do totem autenticado. Abre WS
//   pra ouvir eventos do backend (revogação, config, etc).

import { useDeviceStore } from '../../store/deviceStore'
import { useDeviceSocket } from '../../hooks/useDeviceSocket'
import { DevicePairingScreen } from './DevicePairingScreen'
import { RecTotemPage } from '../rec/RecTotemPage'

export function DeviceTotemPage() {
  const { deviceToken, type, deviceId, reset } = useDeviceStore()

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
  return <RecTotemPage />
}
