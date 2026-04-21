import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, MapPin, Palette, Loader2 } from 'lucide-react'
import { sysApi, type MunicipalityAdminDetail } from '../../api/sys'
import { directoryApi, type FacilityDto } from '../../api/workContext'
import { HttpError } from '../../api/client'
import { toast } from '../../store/toastStore'
import { BrandingFields, type BrandingDraft } from '../../components/shared/BrandingFields'
import { buildPdfBlob, type ExportOptions } from '../../lib/export'

/**
 * Tela dedicada de personalização de identidade visual.
 *
 * Layout em 2 colunas (stacked em telas <lg):
 * - Esquerda: form (`BrandingFields`)
 * - Direita: preview ao vivo de um PDF exemplo — atualiza a cada mudança
 *
 * Rotas:
 *   /sys/municipios/:id/personalizar
 *   /sys/unidades/:id/personalizar
 */
export function SysMunicipalityBrandingPage() {
  return <BrandingPage scope="municipality" />
}

export function SysFacilityBrandingPage() {
  return <BrandingPage scope="facility" />
}

interface Props {
  scope: 'municipality' | 'facility'
}

function BrandingPage({ scope }: Props) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')

  // Draft ao vivo que alimenta o preview
  const [draft, setDraft] = useState<BrandingDraft | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      try {
        if (scope === 'municipality') {
          const mun: MunicipalityAdminDetail = await sysApi.getMunicipality(id!)
          if (cancelled) return
          setTitle(mun.name)
          setSubtitle(`${mun.state} · IBGE ${mun.ibge}`)
        } else {
          const all = await directoryApi.listFacilities(undefined, 'all')
          if (cancelled) return
          const fac = all.find((f: FacilityDto) => f.id === id)
          if (fac) {
            setTitle(fac.name)
            setSubtitle(`${fac.type} · ${fac.shortName}`)
          }
        }
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : 'Falha ao carregar.'
        toast.error('Erro', msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id, scope])

  const backHref = scope === 'municipality' ? '/sys/municipios' : '/sys/unidades'
  const scopeLabel = scope === 'municipality' ? 'município' : 'unidade'
  const ScopeIcon = scope === 'municipality' ? MapPin : Building2
  const inheritHint = scope === 'municipality'
    ? 'Esta identidade é a base usada por todas as unidades deste município — cada unidade pode sobrescrever campos individuais.'
    : 'Deixe um campo em branco pra herdar da cidade. A logo específica aqui substitui a da cidade só pra esta unidade.'

  if (!id) {
    return <div className="text-sm text-red-500">Identificador inválido.</div>
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(backHref)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 mt-0.5"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
            <ScopeIcon size={12} />
            {scope === 'municipality' ? 'Município' : 'Unidade'}
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1 text-violet-500 font-medium">
              <Palette size={11} />
              Identidade visual
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
            {loading ? 'Carregando...' : title}
          </h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Layout 2 colunas — form à esquerda, preview à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        {/* Form */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={18} className="text-slate-400 animate-spin" />
            </div>
          ) : (
            <BrandingFields
              scope={scope}
              scopeId={id}
              inheritHint={inheritHint}
              onDraftChange={setDraft}
            />
          )}
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pré-visualização do PDF
            </h2>
            <span className="text-[10px] text-slate-400">atualiza ao vivo</span>
          </div>
          <PdfPreview draft={draft} context={title} />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Exemplo com dados fictícios. Ao salvar, as alterações valem a
            partir do próximo PDF gerado por esta {scopeLabel}.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Preview do PDF ──────────────────────────────────────────────────────────

function PdfPreview({
  draft, context,
}: { draft: BrandingDraft | null; context: string }) {
  const [url, setUrl] = useState<string | null>(null)

  // Debounce — 250ms após a última edição, regenera o PDF.
  useEffect(() => {
    const timer = setTimeout(() => {
      const blob = buildPdfBlob(buildSampleExport(draft, context), 'portrait')
      const next = URL.createObjectURL(blob)
      setUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return next
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, context])

  // Cleanup final
  useEffect(() => {
    return () => { if (url) URL.revokeObjectURL(url) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {url ? (
        <iframe
          src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
          title="Pré-visualização do PDF"
          className="w-full bg-white"
          style={{ height: '640px' }}
        />
      ) : (
        <div className="flex items-center justify-center h-[640px] text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}
    </div>
  )
}

/**
 * Monta um ExportOptions fictício pro preview — mostra logo, cabeçalho,
 * tabela com 5-7 linhas e rodapé, cobrindo tudo que o branding afeta.
 */
function buildSampleExport(
  draft: BrandingDraft | null,
  context: string,
): ExportOptions<SampleRow> {
  return {
    title: 'Relatório de exemplo',
    subtitle: 'Amostra de como os PDFs desta identidade serão gerados',
    context: context || 'Pré-visualização',
    filename: 'preview',
    rows: SAMPLE_ROWS,
    columns: [
      { header: '#',         get: r => r.id, align: 'center', width: 35, bold: true },
      { header: 'Nome',      get: r => r.name },
      { header: 'Categoria', get: r => r.category, align: 'center', width: 90 },
      { header: 'Valor',     get: r => r.value, align: 'right', width: 75 },
    ],
    rowHighlight: r => r.highlight,
    branding: draft ? {
      displayName: draft.displayName || undefined,
      primaryColor: draft.primaryColor || undefined,
      logoDataUrl: draft.logoDataUrl,
      headerLine1: draft.headerLine1 || undefined,
      headerLine2: draft.headerLine2 || undefined,
      footerText: draft.footerText || undefined,
    } : undefined,
  }
}

interface SampleRow {
  id: string
  name: string
  category: string
  value: string
  highlight: 'pink' | 'emerald' | null
}

const SAMPLE_ROWS: SampleRow[] = [
  { id: '01', name: 'Ana Beatriz Costa',   category: 'Paciente', value: 'Ativo',    highlight: null },
  { id: '02', name: 'Bruno Rocha',         category: 'Paciente', value: 'Ativo',    highlight: null },
  { id: '03', name: 'Carla Menezes',       category: 'Servidor', value: 'Destaque', highlight: 'emerald' },
  { id: '04', name: 'Daniel Siqueira',     category: 'Paciente', value: 'Inativo',  highlight: null },
  { id: '05', name: 'Eduarda Pereira',     category: 'Servidor', value: 'Hoje',     highlight: 'pink' },
  { id: '06', name: 'Fernando Lopes',      category: 'Paciente', value: 'Ativo',    highlight: null },
  { id: '07', name: 'Gabriela Monteiro',   category: 'Paciente', value: 'Ativo',    highlight: null },
]
