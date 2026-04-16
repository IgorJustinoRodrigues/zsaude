// Sistema de diálogos imperativos: substitui window.confirm/prompt por
// modais customizados. Use os helpers `confirmDialog` / `promptDialog`,
// que devolvem Promise — fácil de usar em qualquer handler async.
//
//   if (await confirmDialog({ title: 'Remover?', variant: 'danger' })) { ... }
//   const reason = await promptDialog({ title: 'Motivo' })

import { create } from 'zustand'

export type DialogVariant = 'default' | 'danger'

interface BaseDialog {
  id: string
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
}

export interface ConfirmDialog extends BaseDialog {
  kind: 'confirm'
  onResolve: (ok: boolean) => void
}

export interface PromptDialog extends BaseDialog {
  kind: 'prompt'
  defaultValue?: string
  placeholder?: string
  /** `null` se cancelado. */
  onResolve: (value: string | null) => void
}

export type Dialog = ConfirmDialog | PromptDialog

interface DialogState {
  queue: Dialog[]
  push: (d: Dialog) => void
  resolve: (id: string, value: boolean | string | null) => void
}

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  push: d => set(s => ({ queue: [...s.queue, d] })),
  resolve: (id, value) => {
    const d = get().queue.find(x => x.id === id)
    if (!d) return
    if (d.kind === 'confirm') d.onResolve(Boolean(value))
    else d.onResolve(value === false ? null : (value as string | null))
    set(s => ({ queue: s.queue.filter(x => x.id !== id) }))
  },
}))

const newId = () => Math.random().toString(36).slice(2, 10)

// ─── Helpers imperativos ──────────────────────────────────────────────────

export function confirmDialog(opts: Omit<ConfirmDialog, 'id' | 'kind' | 'onResolve'>): Promise<boolean> {
  return new Promise(resolve => {
    useDialogStore.getState().push({
      id: newId(),
      kind: 'confirm',
      onResolve: resolve,
      ...opts,
    })
  })
}

export function promptDialog(opts: Omit<PromptDialog, 'id' | 'kind' | 'onResolve'>): Promise<string | null> {
  return new Promise(resolve => {
    useDialogStore.getState().push({
      id: newId(),
      kind: 'prompt',
      onResolve: resolve,
      ...opts,
    })
  })
}
