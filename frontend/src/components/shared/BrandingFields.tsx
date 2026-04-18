import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Trash2, Loader2, Image as ImageIcon, Info } from 'lucide-react'
import {
  brandingApi, type BrandingRaw, type BrandingScope, type BrandingUpdateInput,
} from '../../api/branding'
import { HttpError, apiFetchBlob } from '../../api/client'
import { toast } from '../../store/toastStore'
import { cn } from '../../lib/utils'

interface Props {
  scope: BrandingScope
  /** ID do município ou unidade. ``null`` = recurso ainda não salvo (esconde a seção). */
  scopeId: string | null
  /**
   * Na unidade, texto de ajuda indicando que campos em branco herdam da cidade.
   * Na cidade, texto explicando que a config é base pra todas as unidades.
   */
  inheritHint?: string
}

const LOGO_MIMES = 'image/jpeg,image/png,image/webp,image/svg+xml'
const LOGO_MAX_BYTES = 5 * 1024 * 1024
const LOGO_MAX_DIM = 160  // preview em pixels

/**
 * Seção "Identidade visual" usada nos forms de Município e Unidade.
 *
 * Reusa a API ``brandingApi`` — busca a config do escopo ao montar,
 * mantém estado local dos campos, grava via PATCH ao clicar em "Salvar
 * identidade". Campos em branco significam "herdar" (cidade herda do
 * sistema; unidade herda da cidade).
 */
export function BrandingFields({ scope, scopeId, inheritHint }: Props) {
  const [raw, setRaw] = useState<BrandingRaw | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Campos controlados
  const [displayName, setDisplayName] = useState('')
  const [headerLine1, setHeaderLine1] = useState('')
  const [headerLine2, setHeaderLine2] = useState('')
  const [footerText, setFooterText] = useState('')
  const [primaryColor, setPrimaryColor] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

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
        url = URL.createObjectURL(blob)
        setLogoPreview(url)
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

  async function handleLogoPicked(file: File) {
    if (!scopeId) return
    if (file.size > LOGO_MAX_BYTES) {
      toast.error('Logo muito grande', 'Máximo 5 MB.')
      return
    }
    setLogoUploading(true)
    try {
      const res = await brandingApi.uploadLogo(scope, scopeId, file)
      setRaw(r => r ? { ...r, logoFileId: res.logoFileId } : r)
      toast.success('Logo atualizada')
    } catch (e) {
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

      {/* Logo */}
      <div className="flex items-start gap-5">
        <div className="relative shrink-0">
          <div
            className="w-40 h-40 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden"
            style={{ maxWidth: LOGO_MAX_DIM, maxHeight: LOGO_MAX_DIM }}
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <ImageIcon size={36} className="text-slate-300 dark:text-slate-600" />
            )}
          </div>
          {logoUploading && (
            <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
              <Loader2 size={18} className="text-white animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Logo exibida nos PDFs e (futuramente) nos painéis desta {scope === 'municipality' ? 'cidade' : 'unidade'}.
            <br />
            Formatos: JPEG, PNG, WEBP ou SVG · Máx. 5 MB.
            <br />
            Recomendado: <strong>SVG</strong> ou PNG com fundo transparente.
          </p>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_MIMES}
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void handleLogoPicked(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
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
          </div>
        </div>
      </div>

      {/* Campos textuais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Nome institucional" hint="Ex: Prefeitura de Anápolis — Secretaria de Saúde">
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={scope === 'facility' ? '— vazio: herda da cidade' : ''}
            className={inputCls}
          />
        </FormField>
        <FormField label="Cor primária" hint="Hex, ex: #10b981">
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

        <FormField label="Cabeçalho — linha 1" hint="Aparece no topo dos PDFs">
          <input value={headerLine1} onChange={e => setHeaderLine1(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="Cabeçalho — linha 2" hint="CNPJ, inscrição, etc.">
          <input value={headerLine2} onChange={e => setHeaderLine2(e.target.value)} className={inputCls} />
        </FormField>

        <FormField label="Rodapé" hint="Endereço, contatos, observações" className="sm:col-span-2">
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
