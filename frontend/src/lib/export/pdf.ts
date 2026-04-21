import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BRAND, HIGHLIGHT_STYLES, type HighlightTone } from './brand'
import type { ExportOptions } from './types'
import { buildFilename, formatCell } from './shared'

type Orientation = 'portrait' | 'landscape'

/** Altura de linha usada no bloco de rodapé customizado (fonte 8pt). */
const FOOTER_LINE_H = 10

/**
 * Converte o texto livre do rodapé em linhas já quebradas na largura da
 * página. Preserva quebras manuais (``\n``) e usa ``splitTextToSize``
 * pra nunca ultrapassar a margem lateral.
 */
function wrapFooterLines(
  doc: jsPDF,
  text: string | undefined,
  maxW: number,
): string[] {
  if (!text?.trim()) return []
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  return text.trim()
    .split(/\r?\n/)
    .flatMap(line => {
      const wrapped = doc.splitTextToSize(line || ' ', maxW)
      return Array.isArray(wrapped) ? wrapped : [wrapped]
    })
}

/**
 * Gera PDF padronizado (fundo branco).
 *
 * Layout por página:
 * 1. Topo: contexto (caixa alta, esquerda) + marca ``zSaúde`` (direita)
 * 2. Divisória
 * 3. (primeira página apenas) Título + subtítulo
 * 4. Tabela
 * 5. Rodapé: "Gerado em ..." + "Página X de Y"
 *
 * ``orientation='landscape'`` quando a tabela tem muitas colunas.
 */
/**
 * Monta o documento jsPDF aplicando layout padronizado + branding.
 *
 * Separado de ``exportPdf`` pra permitir usos sem side-effect (preview
 * em iframe, testes, anexar em e-mail, etc.).
 */
export function buildPdfDoc<T>(
  opts: ExportOptions<T>,
  orientation: Orientation = 'portrait',
): jsPDF {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 40
  const headerY = 30
  const footerY = pageH - 25

  // Body da tabela — strings simples; destacamos linhas via didParseCell.
  const body = opts.rows.map(row =>
    opts.columns.map(c => formatCell(c.get(row))),
  )

  // Mapeia cada linha (índice de body) → tonalidade, se houver.
  const highlights: (HighlightTone | null)[] = opts.rowHighlight
    ? opts.rows.map(r => opts.rowHighlight!(r))
    : []

  // Espaço vertical reservado pelo cabeçalho. Se houver logo/headers
  // customizados, o bloco cresce — estimamos aqui pra não sobrepor a
  // tabela.
  const brand = opts.branding
  const headerExtraH = computeHeaderExtra(brand)
  const FIRST_PAGE_TITLE_BLOCK_H = opts.subtitle ? 55 : 35
  const firstPageTableStart = headerY + 22 + headerExtraH + FIRST_PAGE_TITLE_BLOCK_H
  const subsequentPagesTop = headerY + 22 + headerExtraH

  // Pré-quebra o texto do rodapé customizado já na largura útil da página —
  // preserva ``\n`` do usuário e quebra linhas longas pra nunca invadir a
  // margem lateral. A altura total reserva espaço abaixo da tabela.
  const footerLines = wrapFooterLines(doc, brand?.footerText, pageW - 2 * marginX)
  const FOOTER_BASE_H = 40  // divisória + "Gerado em"/"Página" + margem inferior
  const footerExtraH = footerLines.length > 0
    ? footerLines.length * FOOTER_LINE_H + 6
    : 0
  const tableBottomMargin = FOOTER_BASE_H + footerExtraH

  // ── 1ª página: desenhamos cabeçalho manualmente antes do autoTable
  drawHeader(doc, opts, pageW, marginX, headerY, /* withTitle */ true)

  autoTable(doc, {
    startY: firstPageTableStart,
    margin: {
      left: marginX,
      right: marginX,
      top: subsequentPagesTop,  // garante espaço do cabeçalho nas próximas páginas
      bottom: tableBottomMargin,
    },
    head: [opts.columns.map(c => c.header)],
    body,

    // Tema padrão + override completo.
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: { top: 7, bottom: 7, left: 10, right: 10 },
      lineColor: [...BRAND.divider] as [number, number, number],
      lineWidth: 0.5,
      textColor: [...BRAND.body] as [number, number, number],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [...BRAND.headerBg] as [number, number, number],
      textColor: [...BRAND.headerFg] as [number, number, number],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
      cellPadding: { top: 8, bottom: 8, left: 10, right: 10 },
    },
    alternateRowStyles: {
      fillColor: [...BRAND.stripe] as [number, number, number],
    },

    // Alinhamento + largura + bold por coluna
    columnStyles: Object.fromEntries(
      opts.columns.map((c, i) => {
        const style: Record<string, unknown> = {}
        if (c.width) style.cellWidth = c.width
        if (c.align) style.halign = c.align
        if (c.bold) style.fontStyle = 'bold'
        return [i, style]
      }),
    ),

    didParseCell: (data) => {
      if (data.section !== 'body') return
      const tone = highlights[data.row.index]
      if (!tone) return
      const hl = HIGHLIGHT_STYLES[tone]
      data.cell.styles.fillColor = [...hl.fill] as [number, number, number]
      data.cell.styles.textColor = [...hl.text] as [number, number, number]
      data.cell.styles.fontStyle = 'bold'
    },

    didDrawPage: (data) => {
      // Na primeira página o cabeçalho já foi desenhado.
      // Nas demais, desenhamos o cabeçalho compacto (sem título grande).
      if (data.pageNumber > 1) {
        drawHeader(doc, opts, pageW, marginX, headerY, /* withTitle */ false)
      }
      drawFooter(doc, pageW, marginX, footerY, footerLines)
    },
  })

  // Lista vazia: desenha mensagem
  if (opts.rows.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...BRAND.muted)
    doc.text(
      'Nenhum registro para exportar.',
      pageW / 2, firstPageTableStart + 40, { align: 'center' },
    )
    drawFooter(doc, pageW, marginX, footerY, footerLines)
  }

  return doc
}

/** Retorna o PDF como Blob pronto pra usar em URL/iframe/upload. */
export function buildPdfBlob<T>(
  opts: ExportOptions<T>,
  orientation: Orientation = 'portrait',
): Blob {
  return buildPdfDoc(opts, orientation).output('blob')
}

/**
 * Gera o PDF e abre em nova aba no viewer nativo do browser.
 * Fallback pra download tradicional se o popup for bloqueado.
 */
export function exportPdf<T>(
  opts: ExportOptions<T>,
  orientation: Orientation = 'portrait',
): void {
  const doc = buildPdfDoc(opts, orientation)
  const filename = buildFilename(opts.filename, 'pdf')
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

// ─── Helpers de layout ────────────────────────────────────────────────────────

function drawHeader<T>(
  doc: jsPDF,
  opts: ExportOptions<T>,
  pageW: number,
  marginX: number,
  y: number,
  withTitle: boolean,
) {
  const brand = opts.branding
  const displayName = brand?.displayName?.trim() || BRAND.name
  const primaryRgb = brand?.primaryColor
    ? hexToRgb(brand.primaryColor) ?? (BRAND.primary as unknown as [number, number, number])
    : (BRAND.primary as unknown as [number, number, number])

  // Logo (esquerda, acima do contexto — se houver)
  let logoHeight = 0
  if (brand?.logoDataUrl) {
    try {
      const imgProps = doc.getImageProperties(brand.logoDataUrl)
      const maxH = 36
      const ratio = imgProps.width / imgProps.height
      logoHeight = Math.min(maxH, imgProps.height)
      const logoW = logoHeight * ratio
      doc.addImage(brand.logoDataUrl, marginX, y, logoW, logoHeight)
    } catch {
      // Imagem inválida — ignora silenciosamente
    }
  }

  // Contexto em caixa alta (esquerda, após a logo)
  const contextY = logoHeight > 0 ? y + logoHeight + 6 : y
  if (opts.context) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.muted)
    doc.text(opts.context.toUpperCase(), marginX, contextY, { baseline: 'top' })
  }

  // Marca institucional (direita) — customizada ou zSaúde
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...primaryRgb)
  doc.text(displayName, pageW - marginX, y, { align: 'right', baseline: 'top' })

  // Linhas 1 e 2 do cabeçalho (ex.: "Secretaria Municipal..." + "CNPJ...")
  let rightY = y + 14
  if (brand?.headerLine1?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.body)
    doc.text(brand.headerLine1, pageW - marginX, rightY, { align: 'right', baseline: 'top' })
    rightY += 10
  }
  if (brand?.headerLine2?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.muted)
    doc.text(brand.headerLine2, pageW - marginX, rightY, { align: 'right', baseline: 'top' })
    rightY += 10
  }
  // Sem customização, mantém tagline default
  if (!brand?.headerLine1 && !brand?.headerLine2 && BRAND.tagline) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.muted)
    doc.text(BRAND.tagline, pageW - marginX, rightY, { align: 'right', baseline: 'top' })
  }

  // Divisória (posição ajustada se tem logo grande)
  const dividerY = Math.max(y + 22, contextY + 8, rightY + 4)
  doc.setDrawColor(...BRAND.divider)
  doc.setLineWidth(0.5)
  doc.line(marginX, dividerY, pageW - marginX, dividerY)

  // Título e subtítulo (só na primeira página)
  if (!withTitle) return
  const titleY = dividerY + 22
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...BRAND.heading)
  doc.text(opts.title, marginX, titleY)

  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...BRAND.muted)
    doc.text(opts.subtitle, marginX, titleY + 18)
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().toLowerCase().match(/^#?([0-9a-f]{6})$/)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Pontos adicionais reservados pelo cabeçalho, quando há logo / linhas extras. */
function computeHeaderExtra(brand?: { logoDataUrl?: string | null; headerLine1?: string; headerLine2?: string }): number {
  if (!brand) return 0
  let extra = 0
  if (brand.logoDataUrl) extra += 40        // altura da logo + padding
  if (brand.headerLine1?.trim()) extra += 10
  if (brand.headerLine2?.trim()) extra += 10
  return extra
}

function drawFooter(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  y: number,
  footerLines: string[] = [],
) {
  const dividerY = y - 10

  // Texto customizado (endereço, contatos) fica ACIMA da divisória,
  // já pré-quebrado pelo ``wrapFooterLines`` na largura da página.
  if (footerLines.length > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.muted)
    const GAP = 4
    const blockBottom = dividerY - GAP
    const blockTop = blockBottom - footerLines.length * FOOTER_LINE_H
    for (let i = 0; i < footerLines.length; i++) {
      // Baseline ≈ topo + (i+1)*line_h - descent. Mantém espaçamento
      // uniforme e alinhado à divisória.
      const ly = blockTop + (i + 1) * FOOTER_LINE_H - 2
      doc.text(footerLines[i], pageW / 2, ly, { align: 'center' })
    }
  }

  doc.setDrawColor(...BRAND.divider)
  doc.setLineWidth(0.5)
  doc.line(marginX, dividerY, pageW - marginX, dividerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND.muted)

  const now = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  doc.text(`Gerado em ${now}`, marginX, y)

  const pageInfo = doc.getCurrentPageInfo().pageNumber
  const totalPages = doc.getNumberOfPages()
  doc.text(
    `Página ${pageInfo} de ${totalPages}`,
    pageW - marginX, y,
    { align: 'right' },
  )
}

// Re-export pra consumo único
export { buildFilename }
