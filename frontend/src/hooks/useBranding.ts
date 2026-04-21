import { useEffect, useMemo } from 'react'
import { useBrandingStore } from '../store/brandingStore'
import { useAuthStore } from '../store/authStore'
import type { ExportBranding } from '../lib/export'

/**
 * Hook que retorna a identidade visual efetiva do contexto atual,
 * pronta pra passar no ``ExportMenuButton.options.branding``.
 *
 * Sem argumentos → usa o ``workContext`` do authStore (município + unidade
 * ativos).
 *
 * Uso:
 *     const branding = useBranding()
 *     <ExportMenuButton options={{ ...options, branding }} />
 *
 * Pra MASTER consultando a config de uma cidade específica (sem work-context):
 *     const branding = useBranding({ municipalityId, facilityId })
 */
export function useBranding(
  opts: { municipalityId?: string; facilityId?: string } = {},
): ExportBranding {
  const context = useAuthStore(s => s.context)
  const ensure = useBrandingStore(s => s.ensure)
  const effective = useBrandingStore(s => s.effective)
  const logoDataUrl = useBrandingStore(s => s.logoDataUrl)

  // Usa os params explícitos OU o work-context como fonte.
  const municipalityId = opts.municipalityId ?? context?.municipality.id
  const facilityId = opts.facilityId ?? context?.facility.id

  useEffect(() => {
    void ensure({ municipalityId, facilityId })
  }, [ensure, municipalityId, facilityId])

  return useMemo<ExportBranding>(() => ({
    displayName: effective?.displayName,
    primaryColor: effective?.primaryColor,
    logoDataUrl: logoDataUrl,
    headerLine1: effective?.headerLine1,
    headerLine2: effective?.headerLine2,
    footerText: effective?.footerText,
  }), [effective, logoDataUrl])
}
