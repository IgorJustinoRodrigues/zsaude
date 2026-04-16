// Geocoding via Nominatim (OpenStreetMap). Uso público — limite recomendado
// de 1 req/s; o componente que consome aplica debounce.
//
// Docs: https://nominatim.org/release-docs/latest/api/Search/

export interface NominatimResult {
  lat: number
  lon: number
  display_name: string
}

interface AddressQuery {
  street?: string
  city?: string
  state?: string         // sigla UF
  postalcode?: string
  country?: string       // 'BR' (alpha-2) — default Brasil
}

export async function geocodeAddress(q: AddressQuery): Promise<NominatimResult | null> {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '1', addressdetails: '0' })
  if (q.street)     params.set('street',     q.street)
  if (q.city)       params.set('city',       q.city)
  if (q.state)      params.set('state',      q.state)
  if (q.postalcode) params.set('postalcode', q.postalcode)
  params.set('countrycodes', (q.country ?? 'br').toLowerCase())

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return null
    const arr = await res.json() as Array<{ lat: string; lon: string; display_name: string }>
    if (!arr || arr.length === 0) return null
    return {
      lat: parseFloat(arr[0].lat),
      lon: parseFloat(arr[0].lon),
      display_name: arr[0].display_name,
    }
  } catch {
    return null
  }
}
