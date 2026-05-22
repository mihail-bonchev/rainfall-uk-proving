import { Source, Layer, type LayerProps } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'
import type { DateRange } from 'react-day-picker'
import type { TimeRange } from '../types/api'

async function fetchAreasGeoJSON(url: string): Promise<FeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch EA areas: ${res.status}`)
  return res.json() as Promise<FeatureCollection>
}

// Fade out as you zoom in past station level.
const FADE: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 0]

const fillLayer: LayerProps = {
  id: 'ea-areas-fill',
  type: 'fill',
  maxzoom: 9,
  paint: {
    'fill-color': '#4b5563',
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.08, 8, 0] as ExpressionSpecification,
  },
}

const outlineLayer: LayerProps = {
  id: 'ea-areas-outline',
  type: 'line',
  maxzoom: 9,
  paint: {
    'line-color': '#4b5563',
    'line-width': 1,
    'line-opacity': FADE,
    'line-dasharray': [3, 2],
  },
}

interface Props {
  readingsMap?: Map<string, number>
  timeRange?: TimeRange
  customRange?: DateRange
}

export function EAAreasSource({ readingsMap: _readingsMap, timeRange: _timeRange, customRange: _customRange }: Props) {
  const { data: areasGeoJSON } = useQuery({
    queryKey: ['ea-areas'],
    queryFn: () => fetchAreasGeoJSON('/data/ea-areas.geojson'),
    staleTime: Infinity,
  })

  if (!areasGeoJSON) return null

  return (
    <Source id="ea-areas" type="geojson" data={areasGeoJSON}>
      <Layer {...fillLayer} />
      <Layer {...outlineLayer} />
    </Source>
  )
}
