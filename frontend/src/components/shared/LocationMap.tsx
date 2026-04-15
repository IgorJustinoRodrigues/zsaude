// Mapa Leaflet para cadastro de municípios e bairros.
//
// Suporta:
//  - Marcador principal (ponto central) — clique no mapa define; drag ajusta.
//  - Polígono principal (território) — cliques sucessivos criam vértices;
//    duplo-clique finaliza. Editável depois (drag dos vértices).
//  - Camadas secundárias read-only (ex: bairros já cadastrados).
//
// Modos:
//  - 'idle'        — leitura
//  - 'point'       — próximo clique define/move o marcador principal
//  - 'polygon'     — cliques criam vértices; duplo-clique fecha
//
// Props controladas pelo componente pai (formulário).

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polygon, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L, { type LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '../../lib/utils'

// Ícones em DivIcon (SVG inline) — evita o bug clássico de Leaflet + Vite
// (URLs de asset quebradas) e dá estilo consistente ao sistema.

function svgPin(color: string, size = 32): string {
  // Pino simples no formato gota. anchor visual no "ponto" (base do pino).
  const w = size
  const h = Math.round(size * 1.25)
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 30">
      <defs>
        <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.35"/>
        </filter>
      </defs>
      <path filter="url(#s)"
            d="M12 0C6.48 0 2 4.48 2 10c0 7 10 20 10 20s10-13 10-20c0-5.52-4.48-10-10-10z"
            fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="10" r="3.5" fill="white"/>
    </svg>`
}

function pinIcon(color: string, size = 32): L.DivIcon {
  const h = Math.round(size * 1.25)
  return L.divIcon({
    className: 'zs-pin',
    html: svgPin(color, size),
    iconSize: [size, h],
    iconAnchor: [size / 2, h],    // ponta do pino encosta na coord
    tooltipAnchor: [0, -h + 8],
  })
}

const MAIN_PIN = pinIcon('#7c3aed', 34)    // violeta (município/bairro em edição)
const SECONDARY_PIN = pinIcon('#0ea5e9', 28) // sky (camadas secundárias)

export type LatLng = [number, number]  // [lat, lng]

export type MapMode = 'idle' | 'point' | 'polygon'

export interface MapLayer {
  /** Marcador secundário (ex: um bairro). */
  point?: LatLng | null
  /** Polígono secundário. */
  polygon?: LatLng[] | null
  /** Label curto exibido no hover (opcional). */
  label?: string
  /** Cor de destaque do marker/polygon. */
  color?: string
}

interface Props {
  /** Posição inicial do mapa quando nada há definido. [lat, lng, zoom]. */
  fallbackCenter?: [number, number, number]
  /** Marcador principal (centro do município ou bairro em edição). */
  point: LatLng | null
  /** Polígono principal (território). */
  polygon: LatLng[] | null
  /** Camadas adicionais (read-only). */
  extraLayers?: MapLayer[]

  mode: MapMode
  onPointChange: (p: LatLng | null) => void
  onPolygonChange: (poly: LatLng[] | null) => void

  /** Altura do mapa em CSS (default 400px). */
  height?: string
  className?: string
  /**
   * Quando muda, o mapa faz fit automático nos bounds de todas as geometrias
   * (point/polygon principais + extras). Sem essa prop, o fit só ocorre na
   * montagem. Útil em formulários: manter undefined evita reposicionar
   * enquanto o usuário desenha.
   */
  fitKey?: unknown
}

const DEFAULT_FALLBACK: [number, number, number] = [-15.78, -47.92, 5]  // Brasil central

export function LocationMap({
  fallbackCenter = DEFAULT_FALLBACK,
  point,
  polygon,
  extraLayers = [],
  mode,
  onPointChange,
  onPolygonChange,
  height = '400px',
  className,
  fitKey,
}: Props) {
  const center: LatLngExpression = useMemo(() => {
    if (point) return point
    if (polygon && polygon.length > 0) return polygon[0]
    return [fallbackCenter[0], fallbackCenter[1]]
  }, [point, polygon, fallbackCenter])

  const zoom = point || (polygon && polygon.length > 0) ? 13 : fallbackCenter[2]

  // Agrega todos os pontos/vértices para calcular bounds de fit.
  const allPoints = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = []
    if (point) pts.push(point)
    if (polygon) pts.push(...polygon)
    for (const l of extraLayers) {
      if (l.point) pts.push(l.point)
      if (l.polygon) pts.push(...l.polygon)
    }
    return pts
  }, [point, polygon, extraLayers])

  return (
    <div className={cn('rounded-xl overflow-hidden border border-border', className)} style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <MapInteractions
          mode={mode}
          polygon={polygon}
          onPointChange={onPointChange}
          onPolygonChange={onPolygonChange}
        />

        <AutoFit points={allPoints} fitKey={fitKey} />

        {/* Marcador principal — draggable em qualquer modo ≠ polígono */}
        {point && mode !== 'polygon' && (
          <Marker
            position={point}
            icon={MAIN_PIN}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const ll = e.target.getLatLng()
                onPointChange([ll.lat, ll.lng])
              },
            }}
          />
        )}

        {/* Polígono principal (quando fechado) */}
        {polygon && polygon.length >= 3 && (
          <Polygon
            pathOptions={{ color: '#8b5cf6', weight: 2, fillOpacity: 0.15 }}
            positions={polygon}
          />
        )}

        {/* Polyline preview enquanto desenha (≥ 2 vértices) */}
        {mode === 'polygon' && polygon && polygon.length >= 2 && (
          <Polyline
            pathOptions={{ color: '#8b5cf6', weight: 2, dashArray: '5,5' }}
            positions={polygon}
          />
        )}

        {/* Vértices do polígono — arrastáveis para ajuste fino.
            Double-click num vértice remove. */}
        {polygon && polygon.length > 0 && (polygon.length >= 3 || mode === 'polygon') && polygon.map((p, i) => (
          <Marker
            key={`v${i}`}
            position={p}
            icon={vertexIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const ll = e.target.getLatLng()
                const next = [...polygon]
                next[i] = [ll.lat, ll.lng]
                onPolygonChange(next)
              },
              dblclick: () => {
                // Remove o vértice. Se sobrar <3, o polígono deixa de ser
                // "fechado" mas seguimos aceitando como polyline até desenho
                // completo.
                const next = polygon.filter((_, j) => j !== i)
                onPolygonChange(next.length > 0 ? next : null)
              },
            }}
          />
        ))}

        {/* Camadas secundárias */}
        {extraLayers.map((l, i) => (
          <LayerRenderer key={i} layer={l} />
        ))}
      </MapContainer>
    </div>
  )
}

// ─── AutoFit: ajusta bounds para mostrar todas as geometrias ────────────────

function AutoFit({ points, fitKey }: { points: LatLng[]; fitKey?: unknown }) {
  const map = useMap()
  const firstRun = useRef(true)

  useEffect(() => {
    // Sempre faz fit na primeira montagem quando há pontos.
    // Depois, só refita se `fitKey` for passado e mudar.
    if (!firstRun.current && fitKey === undefined) return
    firstRun.current = false

    if (points.length === 0) return
    const latlngs = points.map(p => L.latLng(p[0], p[1]))
    const bounds = L.latLngBounds(latlngs)
    if (!bounds.isValid()) return

    if (points.length === 1) {
      // 1 ponto só: centraliza com zoom razoável.
      map.setView(latlngs[0], 13, { animate: true })
    } else {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15, animate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, points.length === 0 ? 'empty' : points.map(p => p.join(',')).join('|')])

  return null
}

// ─── Handlers de clique/duplo-clique ─────────────────────────────────────────

function MapInteractions({
  mode,
  polygon,
  onPointChange,
  onPolygonChange,
}: {
  mode: MapMode
  polygon: LatLng[] | null
  onPointChange: (p: LatLng | null) => void
  onPolygonChange: (p: LatLng[] | null) => void
}) {
  const clickGuard = useRef(false)

  useMapEvents({
    click(e) {
      if (clickGuard.current) return  // evita disparar junto com dblclick
      const ll: LatLng = [e.latlng.lat, e.latlng.lng]
      if (mode === 'point') {
        onPointChange(ll)
      } else if (mode === 'polygon') {
        onPolygonChange([...(polygon ?? []), ll])
      }
    },
    dblclick() {
      // Double-click finaliza o polígono (sem adicionar novo ponto).
      clickGuard.current = true
      setTimeout(() => (clickGuard.current = false), 400)
    },
  })
  return null
}

// ─── Ícones ─────────────────────────────────────────────────────────────────

const vertexIcon = L.divIcon({
  className: '',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  html: '<div style="width:10px;height:10px;border-radius:50%;background:#8b5cf6;border:2px solid white;box-shadow:0 0 0 1px #8b5cf6;"></div>',
})

// Pin cache por cor — evita recriar DivIcon toda render.
const _pinCache = new Map<string, L.DivIcon>()
function coloredPin(color: string): L.DivIcon {
  let icon = _pinCache.get(color)
  if (!icon) {
    icon = pinIcon(color, 28)
    _pinCache.set(color, icon)
  }
  return icon
}

// ─── Camadas secundárias (read-only) ────────────────────────────────────────

function LayerRenderer({ layer }: { layer: MapLayer }) {
  const color = layer.color ?? '#0ea5e9'
  return (
    <>
      {layer.point && (
        <Marker position={layer.point} icon={coloredPin(color)}>
          {layer.label && <LabelTooltip text={layer.label} />}
        </Marker>
      )}
      {layer.polygon && layer.polygon.length >= 3 && (
        <Polygon
          pathOptions={{ color, weight: 1.5, fillOpacity: 0.1 }}
          positions={layer.polygon}
        />
      )}
    </>
  )
}

function LabelTooltip({ text }: { text: string }) {
  return <Tooltip direction="top">{text}</Tooltip>
}
