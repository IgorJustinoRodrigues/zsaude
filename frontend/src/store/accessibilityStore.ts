// Preferências de acessibilidade — persistidas no localStorage e aplicadas
// como classes no <html> (lidas via CSS no index.css).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FontFamilyOption = 'default' | 'lexend' | 'verdana' | 'arial' | 'tahoma' | 'serif'
export type FontScaleOption = 0.875 | 1 | 1.125 | 1.25 | 1.5
export type LineSpacingOption = 'normal' | 'relaxed' | 'loose'

interface AccessibilityState {
  fontScale: FontScaleOption
  fontFamily: FontFamilyOption
  highContrast: boolean
  reduceMotion: boolean
  lineSpacing: LineSpacingOption

  setFontScale: (v: FontScaleOption) => void
  setFontFamily: (v: FontFamilyOption) => void
  setHighContrast: (v: boolean) => void
  setReduceMotion: (v: boolean) => void
  setLineSpacing: (v: LineSpacingOption) => void
  reset: () => void
}

const DEFAULTS = {
  fontScale: 1 as FontScaleOption,
  fontFamily: 'default' as FontFamilyOption,
  highContrast: false,
  reduceMotion: false,
  lineSpacing: 'normal' as LineSpacingOption,
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    set => ({
      ...DEFAULTS,
      setFontScale:    fontScale    => set({ fontScale }),
      setFontFamily:   fontFamily   => set({ fontFamily }),
      setHighContrast: highContrast => set({ highContrast }),
      setReduceMotion: reduceMotion => set({ reduceMotion }),
      setLineSpacing:  lineSpacing  => set({ lineSpacing }),
      reset:           ()           => set(DEFAULTS),
    }),
    { name: 'zs-a11y' },
  ),
)

/**
 * Aplica as preferências como classes/CSS-vars no <html>. Chamar uma vez
 * ao montar o app + inscrever em mudanças.
 */
export function applyAccessibility(state: Pick<AccessibilityState,
  'fontScale' | 'fontFamily' | 'highContrast' | 'reduceMotion' | 'lineSpacing'
>): void {
  const root = document.documentElement
  root.style.setProperty('--a11y-font-scale', String(state.fontScale))
  root.dataset.a11yFont = state.fontFamily
  root.dataset.a11yLineSpacing = state.lineSpacing
  root.classList.toggle('a11y-high-contrast', state.highContrast)
  root.classList.toggle('a11y-reduce-motion', state.reduceMotion)
}
