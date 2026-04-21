import { create } from 'zustand'
import { brandingApi, type BrandingEffective } from '../api/branding'

/**
 * Cache em memória da identidade visual efetiva (resolver do backend).
 *
 * Invalidação:
 * - Quando o usuário troca de work-context (município/unidade), a key
 *   (``municipalityId``, ``facilityId``) muda → refetch automático.
 * - Quando admin edita branding (via ``BrandingFields``), chame
 *   ``invalidate()`` no store pra forçar refetch no próximo ``ensure()``.
 *
 * ``loadLogo()`` baixa a imagem como dataURL — útil pra embutir no PDF
 * diretamente (jspdf aceita data URL). Sem autenticação extra, o user
 * já está logado e o endpoint ``/branding/logo/{id}`` é proxy autenticado.
 */

interface BrandingState {
  /** Chave que identifica qual config está carregada. */
  key: string | null
  effective: BrandingEffective | null
  /** DataURL da logo (``data:image/png;base64,...``). null = sem logo. */
  logoDataUrl: string | null
  loading: boolean

  /**
   * Carrega (ou reusa) a identidade. Passe o contexto atual
   * (``workContext?.municipality.id`` / ``workContext?.facility.id``).
   * Sem params → defaults do sistema.
   */
  ensure: (opts: { municipalityId?: string; facilityId?: string }) => Promise<BrandingEffective>
  invalidate: () => void
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  key: null,
  effective: null,
  logoDataUrl: null,
  loading: false,

  async ensure(opts) {
    const key = `${opts.municipalityId ?? ''}|${opts.facilityId ?? ''}`
    const state = get()
    // Cache hit — retorna direto
    if (state.key === key && state.effective && !state.loading) {
      return state.effective
    }

    set({ loading: true })
    try {
      const effective = await brandingApi.effective(opts)
      const logoDataUrl = effective.logoUrl
        ? await fetchLogoAsDataUrl(effective.logoUrl)
        : null
      set({ key, effective, logoDataUrl, loading: false })
      return effective
    } catch {
      // Em caso de erro, retorna defaults locais pra não travar export.
      const fallback: BrandingEffective = {
        displayName: 'zSaúde',
        headerLine1: '',
        headerLine2: '',
        footerText: '',
        primaryColor: '#0ea5e9',
        logoUrl: null,
        pdfConfigs: {},
        sourceMunicipalityId: null,
        sourceFacilityId: null,
      }
      set({ key, effective: fallback, logoDataUrl: null, loading: false })
      return fallback
    }
  },

  invalidate() {
    set({ key: null, effective: null, logoDataUrl: null })
  },
}))

/**
 * Baixa a logo autenticada e converte pra dataURL pra jspdf embutir.
 * Lê via ``fetch`` com credencial do browser (o token vem do authStore
 * via ``apiFetchBlob``). Em caso de falha, retorna ``null``.
 */
async function fetchLogoAsDataUrl(path: string): Promise<string | null> {
  try {
    const { apiFetchBlob } = await import('../api/client')
    const blob = await apiFetchBlob(path)
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
