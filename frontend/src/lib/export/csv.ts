import type { ExportOptions } from './types'
import { buildFilename, download, formatCell } from './shared'

/**
 * Gera CSV compatível com Excel pt-BR:
 * - separador ``;``
 * - BOM UTF-8 (acentos abrem corretos no Excel)
 * - campos com separador / aspas / nova linha entre aspas
 */
export function exportCsv<T>(opts: ExportOptions<T>): void {
  const header = opts.columns.map(c => c.header)
  const body = opts.rows.map(row =>
    opts.columns.map(c => formatCell(c.get(row))),
  )

  const bom = '\ufeff'
  const csv = bom + [header, ...body]
    .map(row => row.map(escapeCsv).join(';'))
    .join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  download(blob, buildFilename(opts.filename, 'csv'))
}

function escapeCsv(v: string): string {
  if (/[;"\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}
