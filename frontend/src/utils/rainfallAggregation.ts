import type { FeatureCollection } from 'geojson'

export function computeAreaAverages(stationsGeoJSON: FeatureCollection): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>()
  for (const { properties } of stationsGeoJSON.features) {
    const area = (properties?.eaAreaName as string | undefined) ?? ''
    if (!area) continue
    const rainfall = (properties?.rainfall_mm as number | undefined) ?? 0
    const acc = sums.get(area) ?? { sum: 0, count: 0 }
    sums.set(area, { sum: acc.sum + rainfall, count: acc.count + 1 })
  }
  return new Map(
    [...sums.entries()].map(([area, { sum, count }]) => [area, count > 0 ? sum / count : 0]),
  )
}
