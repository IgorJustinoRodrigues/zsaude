// Preferência de câmera por ação. Salva deviceId no localStorage — cada
// contexto (scanner de documento, reconhecimento facial, foto de paciente)
// tem sua câmera preferida. O usuário escolhe na 1ª vez e não é mais
// incomodado, com opção de trocar a qualquer momento.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CameraAction = 'document' | 'face' | 'photo'

interface State {
  selections: Partial<Record<CameraAction, string>>  // action → deviceId
  setCamera: (action: CameraAction, deviceId: string) => void
  clearCamera: (action: CameraAction) => void
}

export const useCameraPreferenceStore = create<State>()(
  persist(
    set => ({
      selections: {},
      setCamera: (action, deviceId) =>
        set(s => ({ selections: { ...s.selections, [action]: deviceId } })),
      clearCamera: action =>
        set(s => {
          const next = { ...s.selections }
          delete next[action]
          return { selections: next }
        }),
    }),
    { name: 'zs-cameras' },
  ),
)

export function getCameraPreference(action: CameraAction): string | null {
  return useCameraPreferenceStore.getState().selections[action] ?? null
}
