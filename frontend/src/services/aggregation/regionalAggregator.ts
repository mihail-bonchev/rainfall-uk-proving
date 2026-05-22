import type { Station } from '../api/stationService'

export interface AreaSummary {
  areaName: string
  avgMm: number
  maxMm: number
  stationCount: number
  stationsWithData: number
}

const CAP_MM = 500

export function aggregateByArea(
  readingsMap: Map<string, number>,
  stations: Station[],
): AreaSummary[] {
  const areas = new Map<string, { stationCount: number; cappedTotals: number[] }>()

  for (const station of stations) {
    if (!areas.has(station.eaAreaName)) {
      areas.set(station.eaAreaName, { stationCount: 0, cappedTotals: [] })
    }
    const area = areas.get(station.eaAreaName)!
    area.stationCount++
    if (readingsMap.has(station.id)) {
      area.cappedTotals.push(Math.min(readingsMap.get(station.id)!, CAP_MM))
    }
  }

  return [...areas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([areaName, { stationCount, cappedTotals }]) => {
      const stationsWithData = cappedTotals.length
      const avgMm =
        stationsWithData > 0 ? cappedTotals.reduce((s, v) => s + v, 0) / stationsWithData : 0
      const maxMm = stationsWithData > 0 ? Math.max(...cappedTotals) : 0
      return { areaName, avgMm, maxMm, stationCount, stationsWithData }
    })
}
