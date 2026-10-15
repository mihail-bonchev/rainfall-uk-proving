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

/** Sums consecutive daily points into 7-day buckets, labelled by each bucket's first day. */
export function toWeekly(daily: { date: string; value: number }[]): { date: string; value: number }[] {
  const weeks: { date: string; value: number }[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    weeks.push({ date: chunk[0].date, value: chunk.reduce((sum, d) => sum + d.value, 0) })
  }
  return weeks
}
