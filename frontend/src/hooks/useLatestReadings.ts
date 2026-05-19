import { useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import type { TimeRange } from '../types/api'
import { fetchLatestReadings, fetchReadings } from '../services/api/readingService'
import { upsertReadings } from '../services/db/readingStore'
import { getDateRangeForPreset, getDateRangeForCustom } from '../utils/dateUtils'

export function useLatestReadings(timeRange: TimeRange, customRange?: DateRange) {
  return useQuery<Map<string, number>>({
    queryKey: ['readings', timeRange, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async () => {
      let readings
      if (timeRange === 'custom' && customRange?.from && customRange?.to) {
        readings = await fetchReadings(getDateRangeForCustom(customRange.from, customRange.to))
      } else if (timeRange === '15m') {
        readings = await fetchLatestReadings()
      } else {
        readings = await fetchReadings(getDateRangeForPreset(timeRange))
      }

      await upsertReadings(readings)

      const readingsMap = new Map<string, number>()
      for (const r of readings) {
        readingsMap.set(r.stationRef, (readingsMap.get(r.stationRef) ?? 0) + r.value)
      }
      return readingsMap
    },
    enabled: timeRange !== 'custom' || !!(customRange?.from && customRange?.to),
    refetchInterval: timeRange === 'custom' ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })
}
