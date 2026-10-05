import { useMemo } from 'react'
import { Source, Layer, type LayerProps } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { useEAAreas } from '../hooks/useEAAreas'
import { useStations } from '../hooks/useStations'
import { aggregateByArea } from '../services/aggregation/regionalAggregator'

// No fill: a flat colour per EA area creates hard administrative edges that
// fight the interpolated rainfall surface.

const outlineLayer: LayerProps = {
  id: 'ea-areas-outline',
  type: 'line',
  maxzoom: 7,
  paint: {
    'line-color': '#64748b',
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
}

export function EAAreasSource({ readingsMap = new Map() }: Props) {
  const { data: areasGeoJSON } = useEAAreas()

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
