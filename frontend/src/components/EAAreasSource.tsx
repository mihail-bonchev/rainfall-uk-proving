import { useMemo } from 'react'
import { Source, Layer, type LayerProps } from 'react-map-gl/maplibre'
import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection, Feature, Geometry } from 'geojson'
import type { DateRange } from 'react-day-picker'
import { useStations, toGeoJSON } from '../hooks/useStations'
import { computeAreaAverages } from '../utils/rainfallAggregation'
import { useRegionalSummary } from '../hooks/useRegionalSummary'
import type { TimeRange } from '../types/api'

type AreaProperties = Record<string, unknown> & { short_name: string; area_rainfall_value: number }
type AreaGeoJSON = FeatureCollection<Geometry, AreaProperties>

const DAY_COUNTS: Partial<Record<TimeRange, number>> = {
  '7d': 7,
  '28d': 28,
}

function getColourScale(timeRange: TimeRange): LayerProps['paint'][string] {
  const days = DAY_COUNTS[timeRange] ?? 1
  const [b1, b2, b3, b4, b5, b6, b7] = [0.1, 0.5, 2, 5, 10, 20, 50].map((v) => v * days)
  return [
    'step',
    ['get', 'area_rainfall_value'],
    'transparent',
    b1, '#a8d5f5',
    b2, '#50c8f4',
    b3, '#00a651',
    b4, '#fff200',
    b5, '#ff7f00',
    b6, '#e8001d',
    b7, '#9b0026',
  ]
}

async function fetchAreasGeoJSON(url: string): Promise<FeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch EA areas: ${res.status}`)
  return res.json() as Promise<FeatureCollection>
}

const ZOOM_FADE: LayerProps['paint'][string] = ['interpolate', ['linear'], ['zoom'], 7, 1, 7.5, 0]

function makeFillLayer(timeRange: TimeRange): LayerProps {
  return {
    id: 'ea-areas-fill',
    type: 'fill',
    maxzoom: 8,
    paint: {
      'fill-color': getColourScale(timeRange),
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.75, 7.5, 0],
    },
  }
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

const IS_PERIOD_RANGE = new Set<TimeRange>(['7d', '28d', 'custom'])

interface Props {
  readingsMap?: Map<string, number>
  timeRange?: TimeRange
  customRange?: DateRange
}

export function EAAreasSource({ readingsMap = new Map(), timeRange = '15m', customRange }: Props) {
  const { data: stations = [] } = useStations()

  const { data: areasGeoJSON } = useQuery({
    queryKey: ['ea-areas'],
    queryFn: () => fetchAreasGeoJSON('/data/ea-areas.geojson'),
    staleTime: Infinity,
  })

  const usePeriod = IS_PERIOD_RANGE.has(timeRange)

  const { data: regionalData } = useRegionalSummary(
    usePeriod ? timeRange : '15m',
    usePeriod ? stations : [],
    usePeriod ? customRange : undefined,
  )

  const periodAreaValues = useMemo((): Map<string, number> => {
    if (!usePeriod || !regionalData) return new Map()
    return new Map(regionalData.map((a) => [a.areaName, a.avgMm]))
  }, [usePeriod, regionalData])

  const stationsGeoJSON = useMemo(() => toGeoJSON(stations, readingsMap), [stations, readingsMap])
  const latestAreaAverages = useMemo(() => computeAreaAverages(stationsGeoJSON), [stationsGeoJSON])

  const areaValues = usePeriod ? periodAreaValues : latestAreaAverages

  const enrichedAreas = useMemo((): AreaGeoJSON | null => {
    if (!areasGeoJSON) return null
    return {
      ...areasGeoJSON,
      features: (areasGeoJSON.features as Feature[]).map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          area_rainfall_value: areaValues.get((f.properties as { short_name: string }).short_name) ?? 0,
        },
      })),
    } as AreaGeoJSON
  }, [areasGeoJSON, areaValues])

  if (!enrichedAreas) return null

  return (
    <Source id="ea-areas" type="geojson" data={enrichedAreas}>
      <Layer {...makeFillLayer(timeRange)} />
      <Layer {...outlineLayer} />
    </Source>
  )
}
