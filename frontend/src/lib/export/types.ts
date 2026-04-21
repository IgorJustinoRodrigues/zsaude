import type { HighlightTone } from './brand'

/** Alinhamento da coluna (texto da célula, cabeçalho herda). */
export type Align = 'left' | 'center' | 'right'

export interface ExportColumn<T> {
  /** Rótulo na primeira linha. */
  header: string
  /**
   * Extrai o valor formatado pra célula. Retorne string (preferido,
   * já formatado) ou number (converte com toLocaleString PT-BR).
   */
  get: (row: T) => string | number
  /** Largura em pontos (pt). Opcional — sem valor, autoTable distribui. */
  width?: number
  /** Alinhamento. Default ``left``. */
  align?: Align
  /** Deixa a coluna em bold. Útil para "dia" ou colunas-chave. */
  bold?: boolean
}

export interface ExportOptions<T> {
  /** Título grande no topo da primeira página (ex.: "Aniversariantes"). */
  title: string
  /** Subtítulo opcional (ex.: "Abril · 12 pessoas"). */
  subtitle?: string
  /**
   * Contexto: normalmente o nome do município ("Anápolis/GO"), ou
   * qualquer recorte que ajude a situar o leitor. Aparece em caixa
   * alta no topo de cada página.
   */
  context?: string
  /**
   * Nome base do arquivo, sem extensão. Um timestamp é adicionado
   * automaticamente ao final (ex.: "usuarios" → "usuarios_2026-04-18.csv").
   */
  filename: string
  /** Definição das colunas. */
  columns: ExportColumn<T>[]
  /** Linhas já ordenadas/filtradas como vão aparecer. */
  rows: T[]
  /**
   * Opcional — destaca visualmente uma linha no PDF. Retorne a tonalidade
   * ou ``null`` para não destacar. No CSV é ignorado.
   */
  rowHighlight?: (row: T) => HighlightTone | null
  /**
   * Identidade visual aplicada ao PDF. Sobrescreve os defaults do
   * sistema. Normalmente vem do ``brandingStore`` (config efetiva
   * resolvida para o contexto atual). CSV ignora.
   */
  branding?: ExportBranding
}

export interface ExportBranding {
  /** Nome institucional mostrado no topo direito (ex.: "Prefeitura de Anápolis"). */
  displayName?: string
  /** Cor hex (``#RRGGBB``) aplicada no nome + título. */
  primaryColor?: string
  /** DataURL da logo (``data:image/png;base64,...``). */
  logoDataUrl?: string | null
  /** Linha 1 do cabeçalho (ex.: "Secretaria Municipal de Saúde"). */
  headerLine1?: string
  /** Linha 2 (ex.: "CNPJ 00.000.000/0001-00"). */
  headerLine2?: string
  /** Texto livre do rodapé (acima do "Gerado em..."). */
  footerText?: string
}

export type ExportFormat = 'csv' | 'pdf-portrait' | 'pdf-landscape'
