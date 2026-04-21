// Importação CNES (MASTER) — sobe ZIP de qualquer município sem precisar
// entrar no contexto dele.

import { useEffect, useMemo, useState } from 'react'
import { Upload, FileArchive, CheckCircle2, XCircle, AlertTriangle, Clock, MapPin, Inbox } from 'lucide-react'
import { PageHeader } from '../../components/shared/PageHeader'
import { cnesAdminApi, type CnesImportMasterResult, type CnesImportStatus, type CnesImportStatusOut } from '../../api/cnes'
import { directoryApi, type MunicipalityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { ComboBox, type ComboBoxOption } from '../../components/ui/ComboBox'
import { cn } from '../../lib/utils'

const STATUS_STYLE: Record<CnesImportStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  running: { label: 'Em andamento', cls: 'bg-sky-50 text-sky-700 border-sky-200', icon: <Clock size={12} /> },
  success: { label: 'Concluída',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={12} /> },
  partial: { label: 'Com avisos',   cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle size={12} /> },
  failed:  { label: 'Falhou',       cls: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle size={12} /> },
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

/** Detecta o IBGE dentro do nome do ZIP no formato ``TXTPROC_<ibge>_<aaaamm>.zip``. */
function detectIbgeFromFilename(filename: string): string | null {
  const m = filename.match(/TXTPROC[_-](\d{6,7})[_-]/i)
  return m ? m[1] : null
}

/** "há 3 dias" / "há 2 meses" / "hoje" a partir de uma data ISO. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const day = 24 * 60 * 60 * 1000
  if (diff < day) return 'hoje'
  const days = Math.floor(diff / day)
  if (days < 30) return `há ${days} dia${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(months / 12)
  return `há ${years} ano${years === 1 ? '' : 's'}`
}

/** Resumo do último import CNES do município selecionado. */
function MunImportBadge({
  status, loading,
}: {
  status: CnesImportStatusOut | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
        <Clock size={12} className="animate-spin" />
        Verificando histórico…
      </div>
    )
  }
  if (!status || !status.imported) {
    return (
      <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        <Inbox size={12} />
        Nenhuma importação CNES para este município ainda.
      </div>
    )
  }
  const st = status.lastStatus ? STATUS_STYLE[status.lastStatus] : null
  return (
    <div className="mt-3 flex items-start gap-3 px-3 py-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/40">
      <CheckCircle2 size={14} className="text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-sky-900 dark:text-sky-200">
          <span className="font-semibold">Última importação:</span>{' '}
          {status.lastCompetencia ? formatCompetencia(status.lastCompetencia) : '—'}
          {status.lastImportAt && (
            <span className="text-sky-700/70 dark:text-sky-300/70"> · {timeAgo(status.lastImportAt)}</span>
          )}
        </p>
        {st && (
          <span className={cn(
            'inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold',
            st.cls,
          )}>
            {st.icon}
            {st.label}
          </span>
        )}
      </div>
    </div>
  )
}

export function SysImportCnesPage() {
  const [munList, setMunList] = useState<MunicipalityDto[]>([])
  const [munId, setMunId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<CnesImportMasterResult | null>(null)
  const [loadingDir, setLoadingDir] = useState(true)
  // Histórico CNES do município selecionado (só o resumo da última importação).
  const [munStatus, setMunStatus] = useState<CnesImportStatusOut | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)

  useEffect(() => {
    let cancelled = false
    directoryApi.listMunicipalities('all')
      .then(r => { if (!cancelled) setMunList(r) })
      .catch(e => toast.error('Falha ao listar municípios', e instanceof HttpError ? e.message : ''))
      .finally(() => { if (!cancelled) setLoadingDir(false) })
    return () => { cancelled = true }
  }, [])

  // Quando o user solta um arquivo, tenta sugerir o município pelo IBGE do nome.
  useEffect(() => {
    if (!file || munId || munList.length === 0) return
    const ibge = detectIbgeFromFilename(file.name)
    if (!ibge) return
    const match = munList.find(m => m.ibge === ibge)
    if (match) {
      setMunId(match.id)
      toast.info('Município detectado', `${match.name}/${match.state} · IBGE ${ibge}`)
    }
  }, [file, munList, munId])

  // Busca o histórico de importação do município selecionado.
  useEffect(() => {
    if (!munId) { setMunStatus(null); return }
    let cancelled = false
    setLoadingStatus(true)
    cnesAdminApi.importStatus(munId)
      .then(s => { if (!cancelled) setMunStatus(s) })
      .catch(() => { if (!cancelled) setMunStatus(null) })
      .finally(() => { if (!cancelled) setLoadingStatus(false) })
    return () => { cancelled = true }
    // Refetch também após uma importação terminar (result muda).
  }, [munId, result])

  const munOptions = useMemo<ComboBoxOption[]>(
    () => munList.map(m => ({ value: m.id, label: m.name, hint: `${m.state} · ${m.ibge}` })),
    [munList],
  )

  const chosenMun = useMemo(() => munList.find(m => m.id === munId) ?? null, [munList, munId])

  const canUpload = !!file && !!munId && !uploading

  const handleUpload = async () => {
    if (!file || !munId) return
    setUploading(true)
    setResult(null)
    try {
      const r = await cnesAdminApi.uploadImport(munId, file)
      setResult(r)
      setFile(null)
      if (r.status === 'success') toast.success('Importação concluída', `${r.totalRowsProcessed.toLocaleString('pt-BR')} linhas`)
      else if (r.status === 'partial') toast.warning('Concluída com avisos', STATUS_STYLE[r.status].label)
      else toast.error('Importação falhou', STATUS_STYLE[r.status].label)
    } catch (e) {
      toast.error('Falha na importação', e instanceof HttpError ? e.message : 'Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Importação CNES (MASTER)"
        subtitle="Sobe o pacote TXTPROC para qualquer município cadastrado — escolhe abaixo."
        back="/sys/importacoes"
      />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-5 space-y-4">
        {/* Município */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Município de destino *
          </label>
          <ComboBox
            value={munId}
            onChange={setMunId}
            disabled={loadingDir}
            placeholder={loadingDir ? 'Carregando municípios…' : 'Selecione o município'}
            options={munOptions}
          />
          {chosenMun && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1">
              <MapPin size={11} />
              O ZIP será extraído no schema <span className="font-mono">mun_{chosenMun.ibge}</span>.
            </p>
          )}

          {/* Histórico de importação do município selecionado */}
          {chosenMun && <MunImportBadge status={munStatus} loading={loadingStatus} />}
        </div>

        {/* Arquivo */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Pacote CNES *
          </label>
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
                    TXTPROC_&lt;ibge&gt;_&lt;aaaamm&gt;.zip — o município é sugerido pelo IBGE no nome.
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

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={!canUpload}
            onClick={handleUpload}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={15} />
            {uploading ? 'Processando…' : 'Importar'}
          </button>
        </div>

        {uploading && (
          <p className="text-xs text-slate-500">
            Processando o ZIP — pode levar alguns segundos dependendo do tamanho.
          </p>
        )}
      </div>

      {/* Resultado */}
      {result && (
        <div className={cn(
          'bg-white dark:bg-slate-900 rounded-2xl p-5 border border-sky-200 dark:border-sky-900 ring-2 ring-sky-100 dark:ring-sky-950',
        )}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Resultado da importação</p>
              <h3 className="text-lg font-semibold mt-0.5">{formatCompetencia(result.competencia)}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {result.zipFilename} · {result.totalRowsProcessed.toLocaleString('pt-BR')} linhas
              </p>
            </div>
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold self-start',
              STATUS_STYLE[result.status].cls,
            )}>
              {STATUS_STYLE[result.status].icon}
              {STATUS_STYLE[result.status].label}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
