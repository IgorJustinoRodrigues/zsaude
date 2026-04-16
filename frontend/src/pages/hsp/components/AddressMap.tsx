import { useCallback, useEffect, useState } from 'react'
import { MapPin, Loader2, Search, AlertCircle } from 'lucide-react'
import { LocationMap, type LatLng } from '../../../components/shared/LocationMap'
import { geocodeAddress } from '../../../api/nominatim'

interface Props {
  endereco: string
  numero: string
  bairro: string
  cidade: string
  uf: string
  cep: string
  /** ISO alpha-3 (default 'BRA'). Convertido pra alpha-2 para Nominatim. */
  pais?: string
  /** Busca automática ao montar (uma vez). Útil em telas read-only. */
  autoSearch?: boolean
  /** Altura do mapa (default 280px). */
  height?: string
}

const ISO3_TO_ISO2: Record<string, string> = {
  BRA: 'br', ARG: 'ar', URY: 'uy', PRY: 'py', BOL: 'bo', PER: 'pe',
  COL: 'co', VEN: 've', CHL: 'cl', USA: 'us', PRT: 'pt', ESP: 'es',
  ITA: 'it', FRA: 'fr', DEU: 'de', GBR: 'gb', JPN: 'jp', CHN: 'cn',
}

type Status = 'idle' | 'loading' | 'found' | 'notfound'

/**
 * Mostra um mapa com marcador na coordenada resolvida do endereço.
 * Disparo manual via botão "Localizar" — economiza chamadas à API
 * pública e dá previsibilidade ao usuário.
 */
export function AddressMap(props: Props) {
  const [point, setPoint] = useState<LatLng | null>(null)
  const [resolved, setResolved] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')

  // Mínimo necessário pra fazer sentido a busca.
  const canSearch =
    (!!props.cidade && !!props.uf) || props.cep.length === 8

  const handleSearch = useCallback(async () => {
    if (!canSearch) return
    setStatus('loading')
    const country = ISO3_TO_ISO2[(props.pais ?? 'BRA').toUpperCase()] ?? 'br'
    const street = [props.endereco, props.numero].filter(Boolean).join(', ')
    const result = await geocodeAddress({
      street: street || undefined,
      city: props.cidade || undefined,
      state: props.uf || undefined,
      postalcode: props.cep || undefined,
      country,
    })
    if (result) {
      setPoint([result.lat, result.lon])
      setResolved(result.display_name)
      setStatus('found')
    } else {
      setPoint(null)
      setResolved(null)
      setStatus('notfound')
    }
  }, [canSearch, props.cidade, props.uf, props.cep, props.pais, props.endereco, props.numero])

  // Busca automática (uma vez) — só quando autoSearch + canSearch.
  // setState dentro do effect é intencional: side-effect one-shot async.
  useEffect(() => {
    if (props.autoSearch && canSearch && status === 'idle') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void handleSearch()
    }
  }, [props.autoSearch, canSearch, status, handleSearch])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 flex-1">
          <MapPin size={12} className="shrink-0" />
          {status === 'loading' && (
            <span className="flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Localizando endereço...
            </span>
          )}
          {status === 'found' && resolved && (
            <span className="truncate" title={resolved}>{resolved}</span>
          )}
          {status === 'notfound' && (
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertCircle size={11} /> Endereço não encontrado nos dados públicos.
            </span>
          )}
          {status === 'idle' && (
            <span>
              {canSearch
                ? 'Clique em Localizar para buscar no mapa.'
                : 'Preencha cidade + UF (ou CEP) para localizar.'}
            </span>
          )}
        </div>

        {!props.autoSearch && (
          <button
            type="button"
            onClick={handleSearch}
            disabled={!canSearch || status === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Search size={12} />
            {point ? 'Buscar de novo' : 'Localizar'}
          </button>
        )}
      </div>

      <LocationMap
        point={point}
        polygon={null}
        mode="idle"
        onPointChange={() => {}}
        onPolygonChange={() => {}}
        height={props.height ?? '280px'}
        fitKey={point ? `${point[0]},${point[1]}` : 'empty'}
      />
    </div>
  )
}
