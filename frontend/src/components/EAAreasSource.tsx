import { useMemo } from 'react'
import { Source, Layer, type LayerProps } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'
import type { DateRange } from 'react-day-picker'
import type { TimeRange } from '../types/api'
import { useStations } from '../hooks/useStations'
import { aggregateByArea } from '../services/aggregation/regionalAggregator'

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

// Choropleth fill removed — it painted each EA region with a flat uniform colour,
// creating hard administrative boundaries that fight the heatmap's smooth gradients.
// The heatmap handles all density colouring from actual station data.

const outlineLayer: LayerProps = {
  id: 'ea-areas-outline',
  type: 'line',
  maxzoom: 7,
  paint: {
    'line-color': '#ffffff',
    'line-width': 0.5,
    'line-opacity': [
      'interpolate', ['linear'], ['zoom'],
      5, 0.15,
      7, 0,
    ] as ExpressionSpecification,
    'line-dasharray': [4, 3],
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

  // Average the per-station accumulated totals, counting only stations that reported data.
  const areaAverages = useMemo(() => {
    const summaries = aggregateByArea(readingsMap, stations)
    return new Map(summaries.map((s) => [s.areaName, s.avgMm]))
  }, [readingsMap, stations])

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
      <Layer {...outlineLayer} />
    </Source>
  )
}
