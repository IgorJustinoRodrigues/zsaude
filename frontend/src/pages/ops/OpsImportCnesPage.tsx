// Importação CNES — upload + histórico + detalhe.

import { useEffect, useMemo, useState } from 'react'
import { Upload, FileArchive, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { cnesApi, type CnesImportDetail, type CnesImportFileItem, type CnesImportSummary, type CnesImportStatus } from '../../api/cnes'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { cn } from '../../lib/utils'

const STATUS_STYLE: Record<CnesImportStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  running: { label: 'Em andamento', cls: 'bg-sky-50 text-sky-700 border-sky-200',         icon: <Clock size={12} /> },
  success: { label: 'Concluída',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={12} /> },
  partial: { label: 'Com avisos',   cls: 'bg-amber-50 text-amber-700 border-amber-200',     icon: <AlertTriangle size={12} /> },
  failed:  { label: 'Falhou',       cls: 'bg-red-50 text-red-700 border-red-200',           icon: <XCircle size={12} /> },
}

function formatCompetencia(aaaamm: string): string {
  if (aaaamm.length !== 6) return aaaamm
  const ano = aaaamm.slice(0, 4)
  const mes = aaaamm.slice(4, 6)
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const i = parseInt(mes, 10) - 1
  return `${meses[i] ?? mes}/${ano}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
}

export function OpsImportCnesPage() {
  const ctx = useAuthStore(s => s.context)
  const can = useAuthStore(s => s.can)
  const canExecute = can('ops.import.execute')

  const [history, setHistory] = useState<CnesImportSummary[]>([])
  const [lastDetail, setLastDetail] = useState<CnesImportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<CnesImportDetail | null>(null)

  const loadHistory = async () => {
    try {
      const items = await cnesApi.list(20)
      setHistory(items)
      if (items[0]) {
        const detail = await cnesApi.get(items[0].id)
        setLastDetail(detail)
      } else {
        setLastDetail(null)
      }
    } catch (e) {
      toast.error('Falha ao carregar histórico', e instanceof HttpError ? e.message : '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadHistory() }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setResult(null)
    try {
      const detail = await cnesApi.upload(file)
      setResult(detail)
      setFile(null)
      await loadHistory()
      const statusInfo = STATUS_STYLE[detail.status]
      if (detail.status === 'success') toast.success('Importação concluída', `${detail.totalRowsProcessed.toLocaleString('pt-BR')} registros`)
      else if (detail.status === 'partial') toast.warning('Concluída com avisos', statusInfo.label)
      else toast.error('Importação falhou', detail.errorMessage || '')
    } catch (e) {
      toast.error('Falha na importação', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  const displayedDetail = result ?? lastDetail

  return (
    <div>
      <PageHeader
        title="Importação CNES"
        subtitle={
          ctx
            ? `Município: ${ctx.municipality.name}/${ctx.municipality.state} · IBGE ${ctx.municipality.ibge ?? ''}`
            : undefined
        }
        back="/ops/importacoes"
      />

      {/* Nova importação */}
      {canExecute && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <label className={cn(
                'flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
                file
                  ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600',
              )}>
                <FileArchive size={20} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  {file ? (
                    <>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        Selecione o pacote .zip do CNES
                      </p>
                      <p className="text-xs text-slate-400">
                        TXTPROC_&lt;ibge&gt;_&lt;aaaamm&gt;.zip
                      </p>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <button
              disabled={!file || uploading}
              onClick={handleUpload}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Upload size={16} />
              {uploading ? 'Processando…' : 'Importar'}
            </button>
          </div>
          {uploading && (
            <p className="text-xs text-slate-500 mt-3">
              Processando pacote. Pode levar alguns segundos dependendo do tamanho.
            </p>
          )}
        </div>
      )}

      {/* Detalhe da última (ou acabada de rodar) importação */}
      {displayedDetail && (
        <ImportDetailCard detail={displayedDetail} highlight={!!result} />
      )}

      {/* Histórico */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold mb-3">Histórico</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : history.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            Nenhuma importação registrada ainda.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-border rounded-xl divide-y divide-border overflow-hidden">
            {history.map(h => {
              const s = STATUS_STYLE[h.status]
              return (
                <div key={h.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {formatCompetencia(h.competencia)}
                      <span className="text-muted-foreground font-normal"> · {h.zipFilename}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.uploadedByUserName || '—'} · {formatDateTime(h.startedAt)} · {h.totalRowsProcessed.toLocaleString('pt-BR')} linhas
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap', s.cls)}>
                    {s.icon}
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detail card ────────────────────────────────────────────────────────────

function ImportDetailCard({ detail, highlight }: { detail: CnesImportDetail; highlight: boolean }) {
  const s = STATUS_STYLE[detail.status]
  const title = highlight ? 'Resultado da importação' : 'Última importação'

  return (
    <div className={cn(
      'bg-white dark:bg-slate-900 rounded-2xl p-5 border',
      highlight ? 'border-sky-200 ring-2 ring-sky-100' : 'border-slate-200 dark:border-slate-800',
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{title}</p>
          <h3 className="text-lg font-semibold mt-0.5">
            {formatCompetencia(detail.competencia)}
          </h3>
          <p className="text-xs text-muted-foreground">
            {detail.uploadedByUserName || '—'} · {formatDateTime(detail.startedAt)}
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold whitespace-nowrap self-start', s.cls)}>
          {s.icon}
          {s.label}
        </span>
      </div>

      {detail.errorMessage && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          {detail.errorMessage}
        </p>
      )}

      {/* Cards por arquivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detail.files.map(f => <FileCard key={f.filename} file={f} />)}
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Total processado: {detail.totalRowsProcessed.toLocaleString('pt-BR')} linhas · {formatBytes(detail.zipSizeBytes)}
      </p>
    </div>
  )
}

function FileCard({ file }: { file: CnesImportFileItem }) {
  const ok = !file.errorMessage && file.warnings.length === 0
  const hasWarn = file.warnings.length > 0
  const hasErr = !!file.errorMessage

  const dotCls = hasErr
    ? 'bg-red-500'
    : hasWarn
    ? 'bg-amber-500'
    : file.rowsTotal > 0
    ? 'bg-emerald-500'
    : 'bg-slate-300'

  return (
    <details className="border border-border rounded-lg bg-slate-50/30 dark:bg-slate-800/20">
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 rounded-lg">
        <span className={cn('w-2 h-2 rounded-full shrink-0', dotCls)} />
        <code className="text-xs font-mono font-medium flex-1">{file.filename}</code>
        <span className="text-xs text-muted-foreground">
          {file.rowsInserted > 0 && <span>{file.rowsInserted.toLocaleString('pt-BR')} novos · </span>}
          {file.rowsUpdated > 0 && <span>{file.rowsUpdated.toLocaleString('pt-BR')} atualizados · </span>}
          {file.rowsSkipped > 0 && <span>{file.rowsSkipped.toLocaleString('pt-BR')} ignorados · </span>}
          {file.rowsTotal.toLocaleString('pt-BR')} total
        </span>
      </summary>
      {(hasWarn || hasErr) && (
        <div className="px-3 pb-3 pt-1 space-y-1">
          {hasErr && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {file.errorMessage}
            </p>
          )}
          {file.warnings.slice(0, 20).map((w, i) => (
            <p key={i} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded p-2">
              {w}
            </p>
          ))}
          {file.warnings.length > 20 && (
            <p className="text-[11px] text-muted-foreground italic">
              + {file.warnings.length - 20} avisos adicionais
            </p>
          )}
        </div>
      )}
    </details>
  )
}
