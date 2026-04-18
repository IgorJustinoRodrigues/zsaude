/** Formata valor de célula pra string. Números saem no formato pt-BR. */
export function formatCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return v.toLocaleString('pt-BR')
  return String(v)
}

/** Nome de arquivo: ``{base}_{YYYY-MM-DD}.{ext}``. */
export function buildFilename(base: string, ext: 'csv' | 'pdf'): string {
  const today = new Date()
  const iso = today.toISOString().slice(0, 10)
  const slug = base.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'export'}_${iso}.${ext}`
}

/** Dispara o download de um Blob no navegador. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
