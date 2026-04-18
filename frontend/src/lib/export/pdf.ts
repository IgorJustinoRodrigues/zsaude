import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BRAND, HIGHLIGHT_STYLES, type HighlightTone } from './brand'
import type { ExportOptions } from './types'
import { buildFilename, formatCell } from './shared'

type Orientation = 'portrait' | 'landscape'

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
export function exportPdf<T>(
  opts: ExportOptions<T>,
  orientation: Orientation = 'portrait',
): void {
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

  // Espaço vertical do topo da tabela: depende se é primeira página
  // (que mostra título grande) ou não (só contexto + zSaúde).
  // autoTable cuida de repaginar; nosso ``didDrawPage`` re-renderiza
  // topo/rodapé em todas.
  const FIRST_PAGE_TITLE_BLOCK_H = opts.subtitle ? 55 : 35
  const firstPageTableStart = headerY + 22 + FIRST_PAGE_TITLE_BLOCK_H

  // ── 1ª página: desenhamos cabeçalho manualmente antes do autoTable
  drawHeader(doc, opts, pageW, marginX, headerY, /* withTitle */ true)

  autoTable(doc, {
    startY: firstPageTableStart,
    margin: {
      left: marginX,
      right: marginX,
      top: headerY + 22,        // garante espaço do contexto quando quebra página
      bottom: 40,
    },
    head: [opts.columns.map(c => c.header)],
    body,

    // Tema padrão + override completo.
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: { top: 7, bottom: 7, left: 10, right: 10 },
      lineColor: BRAND.divider as unknown as number[],
      lineWidth: 0.5,
      textColor: BRAND.body as unknown as number[],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: BRAND.headerBg as unknown as number[],
      textColor: BRAND.headerFg as unknown as number[],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
      cellPadding: { top: 8, bottom: 8, left: 10, right: 10 },
    },
    alternateRowStyles: {
      fillColor: BRAND.stripe as unknown as number[],
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
      data.cell.styles.fillColor = hl.fill as unknown as number[]
      data.cell.styles.textColor = hl.text as unknown as number[]
      data.cell.styles.fontStyle = 'bold'
    },

    didDrawPage: (data) => {
      // Na primeira página o cabeçalho já foi desenhado.
      // Nas demais, desenhamos o cabeçalho compacto (sem título grande).
      if (data.pageNumber > 1) {
        drawHeader(doc, opts, pageW, marginX, headerY, /* withTitle */ false)
      }
      drawFooter(doc, pageW, marginX, footerY)
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
    drawFooter(doc, pageW, marginX, footerY)
  }

  // Abre em nova aba — preview nativo do browser. Usuário pode ler, imprimir
  // ou salvar pelo próprio viewer (Ctrl+S / botão de download).
  // Chamada precisa rodar síncrona dentro do click handler pra não ser
  // bloqueada pelo popup blocker.
  const filename = buildFilename(opts.filename, 'pdf')
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    // Popup bloqueado — fallback pra download tradicional.
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  // Libera a URL depois que a aba teve tempo de carregar.
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
  // Contexto em caixa alta (esquerda)
  if (opts.context) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.muted)
    doc.text(opts.context.toUpperCase(), marginX, y, { baseline: 'top' })
  }

  // Marca zSaúde (direita)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...BRAND.primary)
  doc.text(BRAND.name, pageW - marginX, y, { align: 'right', baseline: 'top' })
  if (BRAND.tagline) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.muted)
    doc.text(BRAND.tagline, pageW - marginX, y + 12, {
      align: 'right', baseline: 'top',
    })
  }

  // Divisória
  doc.setDrawColor(...BRAND.divider)
  doc.setLineWidth(0.5)
  doc.line(marginX, y + 22, pageW - marginX, y + 22)

  // Título e subtítulo (só na primeira página)
  if (!withTitle) return
  const titleY = y + 44
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

function drawFooter(
  doc: jsPDF,
  pageW: number,
  marginX: number,
  y: number,
) {
  doc.setDrawColor(...BRAND.divider)
  doc.setLineWidth(0.5)
  doc.line(marginX, y - 10, pageW - marginX, y - 10)

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
