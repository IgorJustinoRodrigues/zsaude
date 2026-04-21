// Estado do device em si (totem ou painel rodando num navegador público).
//
// Guarda no localStorage:
// - ``deviceId``: conhecido só por este device; usado pra polling
//   durante o pareamento.
// - ``deviceToken``: emitido uma vez pelo backend quando o admin pareia.
//   É o "crachá" usado em todos os requests autenticados do device.
// - ``type``, ``name``, ``facilityId``: snapshot do pareamento.
//
// O fluxo é disparado pelas telas ``/dispositivo/totem`` e ``/dispositivo/painel``.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DeviceType } from '../api/devices'

interface State {
  /** Enquanto pending: deviceId conhecido pro polling; token ainda null. */
  deviceId: string | null
  /** Plaintext do token de acesso do device. Nunca exibido na tela. */
  deviceToken: string | null
  /** Tipo (totem/painel). Setado no register. */
  type: DeviceType | null
  /** Nome amigável (setado pelo admin ao parear). */
  name: string | null
  /** Unidade à qual o device foi vinculado. */
  facilityId: string | null

  /** Marca começo do pareamento — guarda deviceId e tipo. */
  beginPairing: (deviceId: string, type: DeviceType) => void
  /** Marca pareamento concluído — guarda token + metadados. */
  completePairing: (token: string, name: string | null, facilityId: string | null) => void
  /** Apaga tudo — botão "desparear" ou após revogação. */
  reset: () => void
}

export const useDeviceStore = create<State>()(
  persist(
    set => ({
      deviceId: null,
      deviceToken: null,
      type: null,
      name: null,
      facilityId: null,

      beginPairing: (deviceId, type) =>
        set({ deviceId, type, deviceToken: null, name: null, facilityId: null }),

      completePairing: (token, name, facilityId) =>
        set({ deviceToken: token, name, facilityId }),

      reset: () =>
        set({
          deviceId: null,
          deviceToken: null,
          type: null,
          name: null,
          facilityId: null,
        }),
    }),
    { name: 'zs-device' },
  ),
)
