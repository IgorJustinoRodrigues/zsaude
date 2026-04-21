/**
 * Configuração visual compartilhada dos exports em PDF.
 *
 * Edite aqui para mudar o branding em todo o sistema de uma vez só.
 * Cores são tuplas ``[R, G, B]`` (0-255), compatíveis com jsPDF.
 */

export const BRAND = {
  /** Nome que aparece no canto superior direito de cada página. */
  name: 'zSaúde',
  /** Frase curta abaixo do nome. Vazio para ocultar. */
  tagline: 'Plataforma de saúde municipal',

  /** Cor principal (links, nome do sistema). */
  primary: [14, 165, 233],       // sky-500
  /** Texto destacado (títulos). */
  heading: [15, 23, 42],         // slate-900
  /** Texto normal. */
  body:    [51, 65, 85],         // slate-700
  /** Texto secundário (subtítulos, rodapé). */
  muted:   [100, 116, 139],      // slate-500
  /** Linhas e bordas. */
  divider: [226, 232, 240],      // slate-200
  /** Fundo zebrado nas linhas alternadas da tabela. */
  stripe:  [248, 250, 252],      // slate-50
  /** Fundo do cabeçalho da tabela. */
  headerBg: [241, 245, 249],     // slate-100
  headerFg: [71, 85, 105],       // slate-600
} as const

export type HighlightTone = 'pink' | 'emerald' | 'amber' | 'sky' | 'slate'

export const HIGHLIGHT_STYLES: Record<HighlightTone, {
  fill: readonly [number, number, number]
  text: readonly [number, number, number]
}> = {
  pink:    { fill: [253, 242, 248], text: [157, 23, 77]  }, // pink-50 / pink-800
  emerald: { fill: [236, 253, 245], text: [6, 95, 70]    }, // emerald-50 / emerald-800
  amber:   { fill: [255, 251, 235], text: [146, 64, 14]  }, // amber-50 / amber-800
  sky:     { fill: [240, 249, 255], text: [7, 89, 133]   }, // sky-50 / sky-800
  slate:   { fill: [248, 250, 252], text: [30, 41, 59]   }, // slate-50 / slate-800
}
