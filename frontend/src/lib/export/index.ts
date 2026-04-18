/**
 * Sistema de exportação padronizado (CSV / PDF retrato / PDF paisagem).
 *
 * Uso básico:
 *
 *     import { exportData } from 'lib/export'
 *     exportData('pdf-portrait', {
 *       title: 'Aniversariantes',
 *       subtitle: 'Abril · 12 pessoas',
 *       context: 'Anápolis/GO',
 *       filename: 'aniversariantes-2026-04',
 *       columns: [
 *         { header: 'Dia',     get: u => u.day, align: 'center', bold: true, width: 40 },
 *         { header: 'Nome',    get: u => u.name },
 *         { header: 'Idade',   get: u => `${u.age} anos`, align: 'right', width: 65 },
 *       ],
 *       rows: items,
 *       rowHighlight: u => u.isToday ? 'pink' : null,
 *     })
 *
 * Veja ``docs/exports.md`` para o guia completo.
 */

import { exportCsv } from './csv'
import { exportPdf } from './pdf'
import type { ExportFormat, ExportOptions } from './types'

export function exportData<T>(
  format: ExportFormat,
  opts: ExportOptions<T>,
): void {
  if (format === 'csv')               return exportCsv(opts)
  if (format === 'pdf-portrait')      return exportPdf(opts, 'portrait')
  if (format === 'pdf-landscape')     return exportPdf(opts, 'landscape')
  // TS cobre isso; em runtime, silenciosamente não faz nada.
}

export type { ExportColumn, ExportOptions, ExportFormat, Align } from './types'
export type { HighlightTone } from './brand'
export { BRAND } from './brand'
