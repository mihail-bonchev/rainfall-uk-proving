import { useMemo } from 'react'
import { Source, Layer, type LayerProps } from 'react-map-gl/maplibre'
import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import { useStations, toGeoJSON } from '../hooks/useStations'
import { computeAreaAverages } from '../utils/rainfallAggregation'

type AreaProperties = Record<string, unknown> & { short_name: string; area_rainfall_avg: number }
type AreaGeoJSON = FeatureCollection<Geometry, AreaProperties>

// Met Office colour scale applied to area average rainfall
const CHOROPLETH_COLOUR: LayerProps['paint'][string] = [
  'step',
  ['get', 'area_rainfall_avg'],
  'transparent',
  0.1, '#a8d5f5',
  0.5, '#50c8f4',
  2,   '#00a651',
  5,   '#fff200',
  10,  '#ff7f00',
  20,  '#e8001d',
  50,  '#9b0026',
]

const ZOOM_FADE: LayerProps['paint'][string] = ['interpolate', ['linear'], ['zoom'], 7, 1, 7.5, 0]

const fillLayer: LayerProps = {
  id: 'ea-areas-fill',
  type: 'fill',
  maxzoom: 8,
  paint: {
    'fill-color': CHOROPLETH_COLOUR,
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.75, 7.5, 0],
  },
}

const outlineLayer: LayerProps = {
  id: 'ea-areas-outline',
  type: 'line',
  maxzoom: 8,
  paint: {
    'line-color': '#6b7280',
    'line-width': 1,
    'line-opacity': ZOOM_FADE,
  },
}

async function fetchAreasGeoJSON(url: string): Promise<FeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch EA areas: ${res.status}`)
  return res.json() as Promise<FeatureCollection>
}

interface Props {
  readingsMap?: Map<string, number>
}

export function EAAreasSource({ readingsMap = new Map() }: Props) {
  const { data: stations = [] } = useStations()

  const { data: areasGeoJSON } = useQuery({
    queryKey: ['ea-areas'],
    queryFn: () => fetchAreasGeoJSON('/data/ea-areas.geojson'),
    staleTime: Infinity,
  })

  const stationsGeoJSON = useMemo(() => toGeoJSON(stations, readingsMap), [stations, readingsMap])

  const areaAverages = useMemo(() => computeAreaAverages(stationsGeoJSON), [stationsGeoJSON])

  const enrichedAreas = useMemo((): AreaGeoJSON | null => {
    if (!areasGeoJSON) return null
    return {
      ...areasGeoJSON,
      features: (areasGeoJSON.features as Feature[]).map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          area_rainfall_avg: areaAverages.get((f.properties as { short_name: string }).short_name) ?? 0,
        },
      })),
    } as AreaGeoJSON
  }, [areasGeoJSON, areaAverages])

  if (!enrichedAreas) return null

  return (
    <Source id="ea-areas" type="geojson" data={enrichedAreas}>
      <Layer {...fillLayer} />
      <Layer {...outlineLayer} />
    </Source>
  )
}
