import { useMemo } from 'react'
import { Source, Layer, type LayerProps } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'
import type { DateRange } from 'react-day-picker'
import type { TimeRange } from '../types/api'
import { useStations, toGeoJSON } from '../hooks/useStations'
import { computeAreaAverages } from '../utils/rainfallAggregation'

async function fetchAreasGeoJSON(url: string): Promise<FeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch EA areas: ${res.status}`)
  return res.json() as Promise<FeatureCollection>
}

// Met Office colour scale applied to area-average mm — same breakpoints as station circles.
const CHOROPLETH_COLOUR: ExpressionSpecification = [
  'step',
  ['get', 'rainfall_avg_mm'],
  'rgba(180,180,180,0.5)',
  0.1, '#a8d5f5',
  0.5, '#50c8f4',
  2,   '#00a651',
  5,   '#fff200',
  10,  '#ff7f00',
  20,  '#e8001d',
  50,  '#9b0026',
]

const fillLayer: LayerProps = {
  id: 'ea-areas-fill',
  type: 'fill',
  maxzoom: 9,
  paint: {
    'fill-color': CHOROPLETH_COLOUR,
    'fill-opacity': [
      'interpolate', ['linear'], ['zoom'],
      4,   0,
      5,   0.75,
      7,   0.75,
      8.5, 0,
    ] as ExpressionSpecification,
  },
}

const outlineLayer: LayerProps = {
  id: 'ea-areas-outline',
  type: 'line',
  maxzoom: 9,
  paint: {
    'line-color': '#ffffff',
    'line-width': 1,
    'line-opacity': [
      'interpolate', ['linear'], ['zoom'],
      5, 0.6,
      8, 0,
    ] as ExpressionSpecification,
    'line-dasharray': [3, 2],
  },
}

interface Props {
  readingsMap?: Map<string, number>
  timeRange?: TimeRange
  customRange?: DateRange
}

export function EAAreasSource({ readingsMap = new Map(), timeRange: _timeRange, customRange: _customRange }: Props) {
  const { data: areasGeoJSON } = useQuery({
    queryKey: ['ea-areas'],
    queryFn: () => fetchAreasGeoJSON('/data/ea-areas.geojson'),
    staleTime: Infinity,
  })

  const { data: stations = [] } = useStations()

  const areaAverages = useMemo(() => {
    const stationGeoJSON = toGeoJSON(stations, readingsMap)
    return computeAreaAverages(stationGeoJSON)
  }, [stations, readingsMap])

  const enrichedGeoJSON = useMemo(() => {
    if (!areasGeoJSON) return null
    return {
      ...areasGeoJSON,
      features: areasGeoJSON.features.map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          rainfall_avg_mm: areaAverages.get(feature.properties?.short_name ?? '') ?? 0,
        },
      })),
    } as FeatureCollection
  }, [areasGeoJSON, areaAverages])

  if (!enrichedGeoJSON) return null

  return (
    <Source id="ea-areas" type="geojson" data={enrichedGeoJSON}>
      <Layer {...fillLayer} />
      <Layer {...outlineLayer} />
    </Source>
  )
}
