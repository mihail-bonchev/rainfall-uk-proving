import { useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import type { TimeRange } from '../types/api'
import { fetchLatestReadings, fetchReadings } from '../services/api/readingService'
import { upsertReadings } from '../services/db/readingStore'
import { getDateRangeForPreset, getDateRangeForCustom } from '../utils/dateUtils'
import { useHistoricalReadings } from './useHistoricalReadings'

export function useLatestReadings(timeRange: TimeRange, customRange?: DateRange) {
  const isHistorical = timeRange === '7d' || timeRange === '28d'

  const historicalResult = useHistoricalReadings(
    (isHistorical ? timeRange : '7d') as '7d' | '28d',
    { enabled: isHistorical },
  )

  const eaResult = useQuery<Map<string, number>>({
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

      if (timeRange === '15m') {
        const readingsMap = new Map<string, number>()
        for (const r of readings) {
          readingsMap.set(r.stationRef, r.value)
        }
        return readingsMap
      }

      const readingsMap = new Map<string, number>()
      for (const r of readings) {
        readingsMap.set(r.stationRef, (readingsMap.get(r.stationRef) ?? 0) + r.value)
      }
      return readingsMap
    },
    enabled: !isHistorical && (timeRange !== 'custom' || !!(customRange?.from && customRange?.to)),
    refetchInterval: timeRange === 'custom' ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  return isHistorical ? historicalResult : eaResult
}
