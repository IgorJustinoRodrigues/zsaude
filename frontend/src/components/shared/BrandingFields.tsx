import { useCallback, useEffect, useState } from 'react'
import { Upload, Trash2, Loader2, Image as ImageIcon, Info } from 'lucide-react'
import {
  brandingApi, type BrandingRaw, type BrandingScope, type BrandingUpdateInput,
} from '../../api/branding'
import { HttpError, apiFetchBlob } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'
import { PhotoCropModal } from '../ui/PhotoCropModal'

interface Props {
  scope: BrandingScope
  /** ID do município ou unidade. ``null`` = recurso ainda não salvo (esconde a seção). */
  scopeId: string | null
  /** Texto explicando a herança (opcional). */
  inheritHint?: string
  /**
   * Callback chamado a cada mudança no form (sem precisar salvar).
   * Usado pela página de personalização pra atualizar a pré-visualização
   * do PDF ao vivo.
   */
  onDraftChange?: (draft: BrandingDraft) => void
}

export interface BrandingDraft {
  displayName: string
  headerLine1: string
  headerLine2: string
  footerText: string
  primaryColor: string
  /** DataURL da logo atual (do servidor ou do crop, antes de upload). */
  logoDataUrl: string | null
}

// Proporção retangular — logos institucionais são tipicamente horizontais.
// 3:1 casa bem com o cabeçalho do PDF e segue o padrão do mercado.
const LOGO_ASPECT = 3

/**
 * Seção "Identidade visual" usada na tela dedicada de personalização.
 *
 * - Upload de logo vai por um modal de crop retangular (3:1) com fundo
 *   branco (JPEG). Se o usuário preferir preservar transparência,
 *   subir PNG/SVG direto via arrastar.
 * - Campos textuais (nome, cor, cabeçalho, rodapé) são controlados
 *   localmente; ``onDraftChange`` notifica o pai a cada tecla.
 * - "Salvar identidade" grava via PATCH.
 */
export function BrandingFields({
  scope, scopeId, inheritHint, onDraftChange,
}: Props) {
  const [raw, setRaw] = useState<BrandingRaw | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [showCrop, setShowCrop] = useState(false)

  // Campos controlados
  const [displayName, setDisplayName] = useState('')
  const [headerLine1, setHeaderLine1] = useState('')
  const [headerLine2, setHeaderLine2] = useState('')
  const [footerText, setFooterText] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')

  // Propaga draft a cada mudança — usado pela preview ao vivo do PDF.
  useEffect(() => {
    onDraftChange?.({
      displayName, headerLine1, headerLine2, footerText, primaryColor,
      logoDataUrl: logoPreview,
    })
  }, [onDraftChange, displayName, headerLine1, headerLine2, footerText, primaryColor, logoPreview])

  const load = useCallback(async () => {
    if (!scopeId) { setLoading(false); return }
    setLoading(true)
    try {
      const r = scope === 'municipality'
        ? await brandingApi.getMunicipality(scopeId)
        : await brandingApi.getFacility(scopeId)
      setRaw(r)
      setDisplayName(r.displayName.trim())
      setHeaderLine1(r.headerLine1.trim())
      setHeaderLine2(r.headerLine2.trim())
      setFooterText(r.footerText.trim())
      setPrimaryColor(r.primaryColor.trim())
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao carregar identidade.'
      toast.error('Erro', msg)
    } finally { setLoading(false) }
  }, [scope, scopeId])

  useEffect(() => { void load() }, [load])

  // Carrega preview da logo quando raw muda
  useEffect(() => {
    if (!raw?.logoFileId) { setLogoPreview(null); return }
    let alive = true
    let url: string | null = null
    apiFetchBlob(brandingApi.logoUrl(raw.logoFileId))
      .then(blob => {
        if (!alive) return
        // Converte pra dataURL pra preview + pra passar pro PDF de preview
        const reader = new FileReader()
        reader.onload = () => {
          if (alive && typeof reader.result === 'string') {
            setLogoPreview(reader.result)
          }
        }
        reader.readAsDataURL(blob)
        url = URL.createObjectURL(blob)  // mantém referência pra cleanup
      })
      .catch(() => { if (alive) setLogoPreview(null) })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [raw?.logoFileId])

  if (!scopeId) {
    return (
      <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>Salve o {scope === 'municipality' ? 'município' : 'a unidade'} primeiro para configurar a identidade visual.</span>
      </div>
    )
  }

  async function handleSave() {
    if (!scopeId || saving) return
    setSaving(true)
    try {
      const payload: BrandingUpdateInput = {
        displayName, headerLine1, headerLine2, footerText, primaryColor,
      }
      const updated = scope === 'municipality'
        ? await brandingApi.updateMunicipality(scopeId, payload)
        : await brandingApi.updateFacility(scopeId, payload)
      setRaw(updated)
      toast.success('Identidade salva', 'As alterações já se aplicam aos próximos PDFs.')
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao salvar identidade.'
      toast.error('Erro ao salvar', msg)
    } finally { setSaving(false) }
  }

  /** Recebe o dataURL já cropado pelo modal e faz upload. */
  async function handleCropConfirm(dataUrl: string) {
    setShowCrop(false)
    if (!scopeId) return
    setLogoUploading(true)
    // Atualização otimista — preview já mostra imediato
    setLogoPreview(dataUrl)
    try {
      // Converte dataURL → Blob pra subir como file
      const blob = dataUrlToBlob(dataUrl)
      const file = new File([blob], 'logo.jpg', { type: blob.type })
      const res = await brandingApi.uploadLogo(scope, scopeId, file)
      setRaw(r => r ? { ...r, logoFileId: res.logoFileId } : r)
      toast.success('Logo atualizada')
    } catch (e) {
      // Rollback do preview se falhar
      setLogoPreview(raw?.logoFileId ? logoPreview : null)
      const msg = e instanceof HttpError ? e.message : 'Falha ao enviar logo.'
      toast.error('Erro', msg)
    } finally { setLogoUploading(false) }
  }

  async function handleLogoRemove() {
    if (!scopeId) return
    if (!window.confirm('Remover a logo atual?')) return
    setLogoUploading(true)
    try {
      await brandingApi.deleteLogo(scope, scopeId)
      setRaw(r => r ? { ...r, logoFileId: null } : r)
      setLogoPreview(null)
      toast.success('Logo removida')
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Falha ao remover.'
      toast.error('Erro', msg)
    } finally { setLogoUploading(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={18} className="text-slate-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {inheritHint && (
        <div className="text-xs text-slate-500 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 rounded-lg px-3 py-2 flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>{inheritHint}</span>
        </div>
      )}

      {/* Logo — preview retangular 3:1 */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Logo</label>
        <div className="relative">
          <div
            className={cn(
              'w-full h-24 rounded-xl bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden',
              'dark:bg-slate-800/30',
            )}
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="flex items-center gap-2 text-slate-300 dark:text-slate-600">
                <ImageIcon size={28} />
                <span className="text-xs">Nenhuma logo</span>
              </div>
            )}
          </div>
          {logoUploading && (
            <div className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center">
              <Loader2 size={18} className="text-white animate-spin" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setShowCrop(true)}
            disabled={logoUploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
          >
            <Upload size={13} />
            {raw?.logoFileId ? 'Trocar logo' : 'Enviar logo'}
          </button>
          {raw?.logoFileId && (
            <button
              type="button"
              onClick={handleLogoRemove}
              disabled={logoUploading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
            >
              <Trash2 size={12} />
              Remover
            </button>
          )}
          <p className="text-[11px] text-slate-400 leading-tight">
            Proporção 3:1 (horizontal) · máx. 5 MB · fundo branco ou PNG transparente.
          </p>
        </div>
      </div>

      {/* Campos textuais */}
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Nome institucional" hint="Ex: Prefeitura de Anápolis — Secretaria de Saúde">
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={scope === 'facility' ? '— vazio: herda da cidade' : ''}
            className={inputCls}
          />
        </FormField>

        <FormField label="Cor primária" hint="Aplicada no nome e destaques do PDF">
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={primaryColor || '#0ea5e9'}
              onChange={e => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            />
            <input
              value={primaryColor}
              onChange={e => setPrimaryColor(e.target.value)}
              placeholder="#0ea5e9"
              className={cn(inputCls, 'flex-1 font-mono')}
            />
          </div>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Cabeçalho — linha 1" hint="Topo do PDF (à direita)">
            <input value={headerLine1} onChange={e => setHeaderLine1(e.target.value)} className={inputCls} />
          </FormField>
          <FormField label="Cabeçalho — linha 2" hint="CNPJ, inscrição, etc.">
            <input value={headerLine2} onChange={e => setHeaderLine2(e.target.value)} className={inputCls} />
          </FormField>
        </div>

        <FormField label="Rodapé" hint="Endereço, contatos, observações (centralizado)">
          <textarea
            value={footerText}
            onChange={e => setFooterText(e.target.value)}
            rows={2}
            className={cn(inputCls, 'font-normal')}
          />
        </FormField>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-white disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Salvar identidade
        </button>
      </div>

      {showCrop && (
        <PhotoCropModal
          onConfirm={handleCropConfirm}
          onClose={() => setShowCrop(false)}
          aspect={LOGO_ASPECT}
          circularCrop={false}
          outputSize={900}          // 900x300 dá boa qualidade sem inchar upload
          quality={0.95}
          title="Enviar logo"
          confirmLabel="Usar esta logo"
          accept="image/jpeg,image/png,image/webp"
        />
      )}
    </div>
  )
}

// ─── Helpers locais ──────────────────────────────────────────────────────────

const inputCls =
  'w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-400 text-slate-800 dark:text-slate-200'

function FormField({
  label, hint, className, children,
}: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 leading-relaxed">{hint}</p>}
    </div>
  )
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',', 2)
  const mime = header.match(/^data:([^;]+);base64$/)?.[1] || 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
