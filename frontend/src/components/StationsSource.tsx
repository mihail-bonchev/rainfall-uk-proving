import { useEffect, useMemo, useState } from 'react'
import { Source, Layer, Popup, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { MapLayerMouseEvent } from 'maplibre-gl'
import type { Point } from 'geojson'
import { useStations, toGeoJSON } from '../hooks/useStations'
import type { TimeRange } from '../types/api'

// Calibrated to the ~10% time-of-day sample our multi-day fetch captures.
// e.g. 7d: typical UK week ~30–50 mm actual → ~3–5 mm sampled → max=8 covers heavy rain.
const PERIOD_MAX_MM: Record<TimeRange, number> = {
  '15m':    2,
  '6h':     4,
  '24h':    6,
  '7d':     8,
  '28d':    12,
  'custom': 8,
}

// Met Office colour scale — used on individual station circles at high zoom.
const RAINFALL_COLOUR_SCALE: ExpressionSpecification = [
  'step',
  ['get', 'rainfall_mm'],
  'rgba(180,180,180,0.5)', // grey — station present but no/zero reading
  0.1, '#a8d5f5',
  0.5, '#50c8f4',
  2,   '#00a651',
  5,   '#fff200',
  10,  '#ff7f00',
  20,  '#e8001d',
  50,  '#9b0026',
]

export { RAINFALL_COLOUR_SCALE }

function makeHeatmapLayer(timeRange: TimeRange): LayerProps {
  const maxMm = PERIOD_MAX_MM[timeRange]
  return {
    id: 'rainfall-heat',
    type: 'heatmap',
    maxzoom: 13,
    paint: {
      // Weight: 0 mm = 0 (no contribution). Any real rainfall scales up sharply.
      // Max weight capped at 0.9 so single stations don't instantly saturate to red —
      // areas with multiple heavy stations will push the combined density to 1.0.
      'heatmap-weight': [
        'interpolate', ['linear'],
        ['max', ['get', 'rainfall_mm'], 0],
        0,           0,
        0.05,        0.08,
        maxMm * 0.1, 0.35,
        maxMm * 0.5, 0.72,
        maxMm,       0.9,
      ] as ExpressionSpecification,

      // Moderate intensity — keeps colours diffuse so nearby stations blend
      // rather than each one peaking at red with a hard gradient ring.
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        4,  0.7,
        7,  1.3,
        10, 2.5,
      ] as ExpressionSpecification,

      // Met Office palette applied to the density field.
      'heatmap-color': [
        'interpolate', ['linear'],
        ['heatmap-density'],
        0,    'rgba(0,0,0,0)',
        0.08, 'rgba(168,213,245,0.6)',
        0.2,  '#a8d5f5',
        0.35, '#50c8f4',
        0.5,  '#00a651',
        0.65, '#fff200',
        0.8,  '#ff7f00',
        1,    '#e8001d',
      ] as ExpressionSpecification,

      // Small-ish radius: shows geographic structure (not one big blob) at country
      // zoom, while still merging nearby stations at local zoom.
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        4,  18,
        5,  22,
        6,  28,
        7,  35,
        8,  30,
        9,  22,
        10, 15,
        12, 8,
      ] as ExpressionSpecification,

      // Fade out cleanly as station circles take over from zoom 10.
      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        4,  0.9,
        9,  0.85,
        11, 0.3,
        13, 0,
      ] as ExpressionSpecification,
    },
  }
}

// Individual station circles — visible from zoom 9, replace the heatmap at high zoom.
// All stations shown: grey = no data, coloured = has rainfall.
const stationCircleLayer: LayerProps = {
  id: 'station-circles',
  type: 'circle',
  minzoom: 9,
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': RAINFALL_COLOUR_SCALE,
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      9,  3,
      11, 6,
      14, 12,
    ],
    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.9],
    'circle-stroke-width': 1,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.8],
  },
}

interface TooltipState {
  label: string
  longitude: number
  latitude: number
}

interface Props {
  onStationClick?: (stationId: string) => void
  readingsMap?: Map<string, number>
  timeRange?: TimeRange
}

export function StationsSource({ onStationClick, readingsMap = new Map(), timeRange = '15m' }: Props) {
  const { data: stations, isPending } = useStations()
  const { current: mapRef } = useMap()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const geoJSON = useMemo(() => toGeoJSON(stations ?? [], readingsMap), [stations, readingsMap])

  useEffect(() => {
    if (!mapRef) return
    const map = mapRef.getMap()

    const handleStationClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      onStationClick?.(feature.properties?.id as string)
    }

    const handleStationEnter = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = e.features?.[0]
      if (!feature) return
      const [longitude, latitude] = (feature.geometry as Point).coordinates
      setTooltip({ label: feature.properties?.label as string, longitude, latitude })
    }

    const handleStationLeave = () => {
      map.getCanvas().style.cursor = ''
      setTooltip(null)
    }

    map.on('click', 'station-circles', handleStationClick)
    map.on('mouseenter', 'station-circles', handleStationEnter)
    map.on('mouseleave', 'station-circles', handleStationLeave)

    return () => {
      map.off('click', 'station-circles', handleStationClick)
      map.off('mouseenter', 'station-circles', handleStationEnter)
      map.off('mouseleave', 'station-circles', handleStationLeave)
    }
  }, [mapRef, onStationClick])

  if (isPending) return null

  return (
    <>
      {/* cluster={false} so the heatmap always sees individual station points,
          not cluster centroids — clustering was causing one-blob-per-cluster at low zoom */}
      <Source id="stations" type="geojson" data={geoJSON}>
        <Layer {...makeHeatmapLayer(timeRange)} />
        <Layer {...stationCircleLayer} />
      </Source>
      {tooltip && (
        <Popup
          longitude={tooltip.longitude}
          latitude={tooltip.latitude}
          closeButton={false}
          closeOnClick={false}
          offset={10}
        >
          <span className="text-sm font-medium px-1">{tooltip.label}</span>
        </Popup>
      )}
    </>
  )
}
