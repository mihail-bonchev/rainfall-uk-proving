import type { Station } from '../api/stationService'

export interface StationTotal {
  stationRef: string
  totalMm: number
}

export interface AreaSummary {
  areaName: string
  totalMm: number
  avgMm: number
  maxMm: number
  stationCount: number
  stationsWithData: number
}

export function aggregateByArea(stationTotals: StationTotal[], stations: Station[]): AreaSummary[] {
  const stationMap = new Map(stations.map((s) => [s.id, s]))

  const areas = new Map<
    string,
    { stationCount: number; totals: number[] }
  >()

  for (const station of stations) {
    const area = areas.get(station.eaAreaName) ?? { stationCount: 0, totals: [] }
    area.stationCount++
    areas.set(station.eaAreaName, area)
  }

  for (const { stationRef, totalMm } of stationTotals) {
    const station = stationMap.get(stationRef)
    if (!station) continue
    const area = areas.get(station.eaAreaName)
    if (!area) continue
    area.totals.push(totalMm)
  }

  return [...areas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([areaName, { stationCount, totals }]) => {
      const stationsWithData = totals.length
      const totalMm = totals.reduce((sum, v) => sum + v, 0)
      const avgMm = stationsWithData > 0 ? totalMm / stationsWithData : 0
      const maxMm = stationsWithData > 0 ? Math.max(...totals) : 0
      return { areaName, totalMm, avgMm, maxMm, stationCount, stationsWithData }
    })
}
