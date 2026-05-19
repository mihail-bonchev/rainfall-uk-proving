import { useQuery } from '@tanstack/react-query'
import type { TimeRange } from '../types/api'
import { fetchLatestReadings, fetchReadings } from '../services/api/readingService'
import { upsertReadings } from '../services/db/readingStore'
import { getDateRangeForPreset } from '../utils/dateUtils'

export function useLatestReadings(timeRange: TimeRange) {
  return useQuery<Map<string, number>>({
    queryKey: ['readings', timeRange],
    queryFn: async () => {
      const readings =
        timeRange === '15m'
          ? await fetchLatestReadings()
          : await fetchReadings(getDateRangeForPreset(timeRange))

      await upsertReadings(readings)

      const readingsMap = new Map<string, number>()
      for (const r of readings) {
        readingsMap.set(r.stationRef, (readingsMap.get(r.stationRef) ?? 0) + r.value)
      }
      return readingsMap
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })
}
