// URL pública ``/dispositivo/painel``.

import { useDeviceStore } from '../../store/deviceStore'
import { useDeviceSocket } from '../../hooks/useDeviceSocket'
import { useLiveCallStore } from '../../store/liveCallStore'
import { DevicePairingScreen } from './DevicePairingScreen'
import { RecPainelPage } from '../rec/RecPainelPage'

export function DevicePainelPage() {
  const { deviceToken, type, deviceId, reset } = useDeviceStore()
  const pushCall = useLiveCallStore(s => s.push)

  useDeviceSocket({
    onEvent: ({ event, payload }) => {
      if (event === 'device:revoked' && payload.deviceId === deviceId) {
        reset()
        return
      }
      if (event === 'painel:call') {
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
  return <RecPainelPage />
}
