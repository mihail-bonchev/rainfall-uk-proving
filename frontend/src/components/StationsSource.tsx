import { useEffect, useState } from 'react'
import { Source, Layer, Popup, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
import type { Point } from 'geojson'
import { useStations } from '../hooks/useStations'

// Met Office rainfall colour scale — step expression on rainfall_mm property
const RAINFALL_COLOUR_SCALE = [
  'step',
  ['get', 'rainfall_mm'],
  'transparent', // < 0.1 mm
  0.1, '#a8d5f5', // pale blue
  0.5, '#50c8f4', // cyan
  2,   '#00a651', // green
  5,   '#fff200', // yellow
  10,  '#ff7f00', // orange
  20,  '#e8001d', // red
  50,  '#9b0026', // dark red/purple
] as LayerProps['paint'][string]

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
] as LayerProps['paint'][string]

// Cluster layers fade in from zoom 6.5→7.5, hold until 10, fade out 10→11
const CLUSTER_OPACITY: LayerProps['paint'][string] = [
  'interpolate', ['linear'], ['zoom'],
  6.5, 0, 7.5, 1, 10, 1, 11, 0,
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

// Individual station circles: fade in 10→11, fully visible at 11+
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
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const CLUSTER_LAYER_IDS = ['clusters-large', 'clusters-medium', 'clusters-small'] as const

export function StationsSource({ onStationClick }: Props) {
  const { data } = useStations()
  const { current: mapRef } = useMap()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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

  if (!data) return null

  return (
    <>
      <Source
        id="stations"
        type="geojson"
        data={data}
        cluster={true}
        clusterMaxZoom={10}
        clusterRadius={50}
        clusterProperties={{ rainfall_sum: ['+', ['get', 'rainfall_mm']] }}
      >
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
