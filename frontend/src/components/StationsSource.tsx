import { useEffect, useMemo, useState } from 'react'
import { Source, Layer, Popup, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { MapLayerMouseEvent } from 'maplibre-gl'
import type { Point } from 'geojson'
import { useStations, toGeoJSON } from '../hooks/useStations'
import type { TimeRange } from '../types/api'

// Expected full-period totals for "heavy but not extreme" UK rain.
// These are normalised values (avg-per-reading × expected-intervals) so they
// represent realistic mm totals, not undersampled partials.
const PERIOD_MAX_MM: Record<TimeRange, number> = {
  '15m':    5,
  '6h':     30,
  '24h':    50,
  '7d':     100,
  '28d':    250,
  'custom': 50,
}

// BBC-style inverted scale for station circles and coverage blobs:
// dark = dry, progressively lighter = wetter, bright green = extreme.
const RAINFALL_COLOUR_SCALE: ExpressionSpecification = [
  'step',
  ['get', 'rainfall_mm'],
  'rgba(80,80,110,0.4)', // dark muted — station present but zero reading
  0.1,  '#081b2e',
  0.5,  '#0d3b6e',
  2,    '#1565c0',
  5,    '#1976d2',
  10,   '#42a5f5',
  20,   '#90caf9',
  50,   '#e3f2fd',
  100,  '#00e676',
]

export { RAINFALL_COLOUR_SCALE }

function makeHeatmapLayer(timeRange: TimeRange): LayerProps {
  const maxMm = PERIOD_MAX_MM[timeRange]
  return {
    id: 'rainfall-heat',
    type: 'heatmap',
    maxzoom: 15,
    paint: {
      // Low max weight so a single outlier doesn't force saturation;
      // warmth must come from a local cluster of wet stations.
      'heatmap-weight': [
        'interpolate', ['linear'],
        ['min', ['max', ['get', 'rainfall_mm'], 0], maxMm],
        0,           0,
        0.5,         0.03,
        maxMm * 0.1, 0.18,
        maxMm * 0.3, 0.38,
        maxMm * 0.6, 0.55,
        maxMm,       0.68,
      ] as ExpressionSpecification,

      // Very low intensity at country zoom so overlapping kernels from
      // England's dense station network don't saturate; ramps up at close
      // zoom where fewer stations overlap.
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        4,  0.12,
        6,  0.45,
        8,  0.9,
        10, 1.2,
        13, 1.5,
      ] as ExpressionSpecification,

      // BBC-style inverted scale: dark background + more rain = lighter/brighter.
      // Low density blends into the dark map; high density glows ice-blue/white.
      // Green reserved for the very top 6% (extreme accumulation only).
      'heatmap-color': [
        'interpolate', ['linear'],
        ['heatmap-density'],
        0,    'rgba(0,0,0,0)',
        0.05, '#081b2e',
        0.18, '#0d3b6e',
        0.32, '#1565c0',
        0.46, '#1976d2',
        0.58, '#42a5f5',
        0.70, '#90caf9',
        0.80, '#bbdefb',
        0.88, '#e3f2fd',
        0.94, '#00e676',
        1.0,  '#69f0ae',
      ] as ExpressionSpecification,

      // Three zoom levels — radius kept large enough at each level that
      // adjacent station kernels overlap and fill coverage.
      // Station spacing in pixels: zoom7=14px, zoom8=29px, zoom9=57px,
      // zoom10=114px, zoom11=228px. Radius must exceed half-spacing.
      // Level 1 (country, zoom 4-6): huge radius → continuous England blob.
      // Level 2 (regional, zoom 7-9): hold radius large to bridge gaps.
      // Level 3 (local, zoom 10+): heatmap fades; coverage circles take over.
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        4,  80,
        5,  80,
        6,  80,
        7,  80,
        8,  90,
        9,  90,
        10, 100,
        11, 110,
        12, 110,
        13, 110,
      ] as ExpressionSpecification,

      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        4,   0.88,
        9,   0.85,
        10,  0.72,
        11,  0.50,
        12,  0.25,
        13,  0,
      ] as ExpressionSpecification,
    },
  }
}

// Large blurred circles that "spread" each station's rainfall over its surrounding
// area at close zoom, bridging the gap as the heatmap fades out. circle-blur: 1
// means the circle fades from solid at the centre to transparent at the edge.
const stationCoverageLayer: LayerProps = {
  id: 'station-coverage',
  type: 'circle',
  minzoom: 9,
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': RAINFALL_COLOUR_SCALE,
    // Radius must exceed half the station spacing to guarantee overlap.
    // zoom10 spacing=114px → need >57px; zoom11 spacing=228px → need >114px.
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      9,  60,
      10, 90,
      11, 130,
      12, 150,
      13, 150,
    ],
    'circle-opacity': [
      'interpolate', ['linear'], ['zoom'],
      9,  0,
      10, 0.28,
      11, 0.32,
      12, 0.28,
      13, 0.20,
    ],
    'circle-blur': 1,
    'circle-stroke-width': 0,
  },
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
        <Layer {...stationCoverageLayer} />
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
