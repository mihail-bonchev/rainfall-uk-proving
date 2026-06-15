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
    maxzoom: 15,
    paint: {
      'heatmap-weight': [
        'interpolate', ['linear'],
        ['min', ['max', ['get', 'rainfall_mm'], 0], maxMm],
        0,           0,
        0.5,         0.05,
        maxMm * 0.1, 0.25,
        maxMm * 0.3, 0.55,
        maxMm * 0.6, 0.75,
        maxMm,       0.9,
      ] as ExpressionSpecification,

      // Reduced intensity so moderate rainfall stays blue rather than
      // saturating into orange/red. Warm colours should only emerge where
      // rainfall is genuinely high relative to the period max.
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        4,  0.35,
        7,  0.65,
        10, 1.1,
        13, 1.4,
      ] as ExpressionSpecification,

      // Blue-dominant palette: warm colours only above density 0.7 so the
      // map reads blue/teal for typical rainfall and orange/red for extremes.
      'heatmap-color': [
        'interpolate', ['linear'],
        ['heatmap-density'],
        0,    'rgba(0,0,0,0)',
        0.05, 'rgba(168,213,245,0.2)',
        0.2,  '#a8d5f5',
        0.42, '#50c8f4',
        0.62, '#00a651',
        0.74, '#fff200',
        0.87, '#ff7f00',
        1,    '#e8001d',
      ] as ExpressionSpecification,

      // Keep radius large at close zoom so stations cover their surrounding
      // area and the heatmap stays continuous (no isolated dot effect).
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        4,  65,
        5,  80,
        6,  75,
        7,  60,
        8,  55,
        9,  50,
        10, 60,
        11, 75,
        12, 85,
        13, 85,
      ] as ExpressionSpecification,

      // Stay visible deep into close zoom — station circles complement rather
      // than replace the heatmap, so the gradient coverage persists.
      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        4,   0.9,
        9,   0.85,
        11,  0.65,
        12,  0.45,
        14,  0.1,
        15,  0,
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
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      9,  35,
      11, 65,
      13, 95,
    ],
    'circle-opacity': [
      'interpolate', ['linear'], ['zoom'],
      9,  0,
      10, 0.18,
      12, 0.14,
      14, 0.08,
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
