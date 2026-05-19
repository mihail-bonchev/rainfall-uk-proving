import { useEffect, useMemo, useState } from 'react'
import { Source, Layer, Popup, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import type { Point } from 'geojson'
import { useStations, toGeoJSON } from '../hooks/useStations'
import type { TimeRange } from '../types/api'

// Period-aware upper bound for heatmap weight normalisation.
// These are "heavy rain" thresholds — values at or above map to full intensity.
const PERIOD_MAX_MM: Record<TimeRange, number> = {
  '15m': 3,
  '6h':  15,
  '24h': 40,
  '7d':  120,
  '28d': 350,
  'custom': 50,
}

function makeHeatmapLayer(timeRange: TimeRange): LayerProps {
  const maxMm = PERIOD_MAX_MM[timeRange]
  return {
    id: 'rainfall-heat',
    type: 'heatmap',
    maxzoom: 12,
    paint: {
      // Weight each station proportionally to its rainfall total.
      'heatmap-weight': [
        'interpolate', ['linear'],
        ['max', ['get', 'rainfall_mm'], 0],
        0,            0,
        0.1,          0.05,
        maxMm * 0.05, 0.2,
        maxMm * 0.2,  0.5,
        maxMm * 0.6,  0.8,
        maxMm,        1,
      ] as ExpressionSpecification,

      // Intensity — boost slightly at higher zoom for fine detail.
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        4, 0.6,
        7, 1.4,
        10, 2,
      ] as ExpressionSpecification,

      // Met Office palette: transparent → pale-blue → cyan → green → yellow → orange → red.
      'heatmap-color': [
        'interpolate', ['linear'],
        ['heatmap-density'],
        0,    'rgba(0,0,0,0)',
        0.05, 'rgba(168,213,245,0.4)',
        0.2,  '#a8d5f5',
        0.35, '#50c8f4',
        0.5,  '#00a651',
        0.65, '#fff200',
        0.8,  '#ff7f00',
        1,    '#e8001d',
      ] as ExpressionSpecification,

      // Radius shrinks as you zoom in — wide blobs at country scale, tight at local scale.
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        4,  70,
        6,  55,
        8,  40,
        10, 25,
        12, 12,
      ] as ExpressionSpecification,

      // Fade the heatmap out as individual station circles take over.
      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        4,  0.9,
        9,  0.85,
        11, 0.3,
        12, 0,
      ] as ExpressionSpecification,
    },
  }
}

// Met Office rainfall colour scale — step expression on rainfall_mm property
const RAINFALL_COLOUR_SCALE = [
  'step',
  ['get', 'rainfall_mm'],
  'transparent',
  0.1, '#a8d5f5',
  0.5, '#50c8f4',
  2,   '#00a651',
  5,   '#fff200',
  10,  '#ff7f00',
  20,  '#e8001d',
  50,  '#9b0026',
] as ExpressionSpecification

// Cluster colour: same scale applied to rainfall_sum / point_count
const CLUSTER_COLOUR_SCALE = [
  'step',
  ['/', ['get', 'rainfall_sum'], ['get', 'point_count']],
  'transparent',
  0.1, '#a8d5f5',
  0.5, '#50c8f4',
  2,   '#00a651',
  5,   '#fff200',
  10,  '#ff7f00',
  20,  '#e8001d',
  50,  '#9b0026',
] as ExpressionSpecification

// Cluster layers fade in from zoom 7→8, hold until 10, fade out 10→11
const CLUSTER_OPACITY: ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  7, 0, 8, 0.9, 10, 0.9, 11, 0,
]

const clustersLargeLayer: LayerProps = {
  id: 'clusters-large',
  type: 'circle',
  minzoom: 7,
  maxzoom: 11,
  filter: ['all', ['has', 'point_count'], ['>=', ['get', 'point_count'], 50]],
  paint: {
    'circle-color': CLUSTER_COLOUR_SCALE,
    'circle-radius': 24,
    'circle-opacity': CLUSTER_OPACITY,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
    'circle-stroke-opacity': CLUSTER_OPACITY,
  },
}

const clustersMediumLayer: LayerProps = {
  id: 'clusters-medium',
  type: 'circle',
  minzoom: 7,
  maxzoom: 11,
  filter: ['all', ['has', 'point_count'], ['>=', ['get', 'point_count'], 10], ['<', ['get', 'point_count'], 50]],
  paint: {
    'circle-color': CLUSTER_COLOUR_SCALE,
    'circle-radius': 18,
    'circle-opacity': CLUSTER_OPACITY,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
    'circle-stroke-opacity': CLUSTER_OPACITY,
  },
}

const clustersSmallLayer: LayerProps = {
  id: 'clusters-small',
  type: 'circle',
  minzoom: 7,
  maxzoom: 11,
  filter: ['all', ['has', 'point_count'], ['<', ['get', 'point_count'], 10]],
  paint: {
    'circle-color': CLUSTER_COLOUR_SCALE,
    'circle-radius': 14,
    'circle-opacity': CLUSTER_OPACITY,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
    'circle-stroke-opacity': CLUSTER_OPACITY,
  },
}

const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  minzoom: 7,
  maxzoom: 11,
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-size': 12,
  },
  paint: {
    'text-color': '#ffffff',
    'text-opacity': CLUSTER_OPACITY,
  },
}

const stationCircleLayer: LayerProps = {
  id: 'station-circles',
  type: 'circle',
  minzoom: 10,
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': RAINFALL_COLOUR_SCALE,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 8],
    'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 11, 0.9],
    'circle-stroke-width': 1,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 11, 1],
  },
}

export { RAINFALL_COLOUR_SCALE }

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

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const CLUSTER_LAYER_IDS = ['clusters-large', 'clusters-medium', 'clusters-small'] as const

export function StationsSource({ onStationClick, readingsMap = new Map(), timeRange = '15m' }: Props) {
  const { data: stations, isPending } = useStations()
  const { current: mapRef } = useMap()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const geoJSON = useMemo(() => toGeoJSON(stations ?? [], readingsMap), [stations, readingsMap])

  useEffect(() => {
    if (!mapRef) return
    const map = mapRef.getMap()

    const handleClusterClick = async (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      const clusterId = feature.properties?.cluster_id as number
      const coords = (feature.geometry as Point).coordinates as [number, number]
      const source = map.getSource('stations') as GeoJSONSource
      try {
        const expansionZoom = await source.getClusterExpansionZoom(clusterId)
        map.flyTo({ center: coords, zoom: expansionZoom, duration: 600, easing: easeInOutCubic })
      } catch {
        // cluster may have dissolved before click resolved
      }
    }

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

    const handleClusterEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const handleClusterLeave = () => { map.getCanvas().style.cursor = '' }

    for (const layer of CLUSTER_LAYER_IDS) {
      map.on('click', layer, handleClusterClick)
      map.on('mouseenter', layer, handleClusterEnter)
      map.on('mouseleave', layer, handleClusterLeave)
    }
    map.on('click', 'station-circles', handleStationClick)
    map.on('mouseenter', 'station-circles', handleStationEnter)
    map.on('mouseleave', 'station-circles', handleStationLeave)

    return () => {
      for (const layer of CLUSTER_LAYER_IDS) {
        map.off('click', layer, handleClusterClick)
        map.off('mouseenter', layer, handleClusterEnter)
        map.off('mouseleave', layer, handleClusterLeave)
      }
      map.off('click', 'station-circles', handleStationClick)
      map.off('mouseenter', 'station-circles', handleStationEnter)
      map.off('mouseleave', 'station-circles', handleStationLeave)
    }
  }, [mapRef, onStationClick])

  if (isPending) return null

  return (
    <>
      <Source
        id="stations"
        type="geojson"
        data={geoJSON}
        cluster={true}
        clusterMaxZoom={10}
        clusterRadius={50}
        clusterProperties={{ rainfall_sum: ['+', ['get', 'rainfall_mm']] }}
      >
        <Layer {...makeHeatmapLayer(timeRange)} />
        <Layer {...clustersLargeLayer} />
        <Layer {...clustersMediumLayer} />
        <Layer {...clustersSmallLayer} />
        <Layer {...clusterCountLayer} />
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
