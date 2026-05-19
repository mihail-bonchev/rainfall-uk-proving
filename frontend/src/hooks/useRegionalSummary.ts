import { useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import { fetchReadings } from '../services/api/readingService'
import { aggregateByArea, type AreaSummary, type StationTotal } from '../services/aggregation/regionalAggregator'
import { getDateRangeForPreset, getDateRangeForCustom } from '../utils/dateUtils'
import type { Station } from '../services/api/stationService'
import type { Reading, TimeRange } from '../types/api'

function sumByStation(readings: Reading[]): StationTotal[] {
  const map = new Map<string, number>()
  for (const r of readings) {
    map.set(r.stationRef, (map.get(r.stationRef) ?? 0) + r.value)
  }
  return Array.from(map.entries()).map(([stationRef, totalMm]) => ({ stationRef, totalMm }))
}

export function useRegionalSummary(timeRange: TimeRange, stations: Station[], customRange?: DateRange) {
  return useQuery<AreaSummary[]>({
    queryKey: ['regional-summary', timeRange, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async () => {
      const params = (timeRange === 'custom' && customRange?.from && customRange?.to)
        ? getDateRangeForCustom(customRange.from, customRange.to)
        : getDateRangeForPreset(timeRange)
      const readings = await fetchReadings(params)
      const stationTotals = sumByStation(readings)
      return aggregateByArea(stationTotals, stations)
    },
    enabled: stations.length > 0 && (timeRange !== 'custom' || !!(customRange?.from && customRange?.to)),
    staleTime: 5 * 60 * 1000,
  })
}
