import { useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import type { TimeRange } from '../types/api'
import { fetchLatestReadings, fetchReadings } from '../services/api/readingService'
import { upsertReadings } from '../services/db/readingStore'
import { getDateRangeForPreset, getDateRangeForCustom, getExpectedIntervals } from '../utils/dateUtils'

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

      // For 15m we use the raw latest reading value per station directly.
      // For all other ranges we normalise: avg-per-reading × expected-intervals.
      // This removes sampling bias caused by different stations having different
      // numbers of readings in our per-day 10k-limit sample window.
      if (timeRange === '15m') {
        const readingsMap = new Map<string, number>()
        for (const r of readings) {
          readingsMap.set(r.stationRef, r.value)
        }
        return readingsMap
      }

      const totals = new Map<string, number>()
      const counts = new Map<string, number>()
      for (const r of readings) {
        totals.set(r.stationRef, (totals.get(r.stationRef) ?? 0) + r.value)
        counts.set(r.stationRef, (counts.get(r.stationRef) ?? 0) + 1)
      }

      let expectedIntervals: number
      if (timeRange === 'custom' && customRange?.from && customRange?.to) {
        const diffHours = (customRange.to.getTime() - customRange.from.getTime()) / 3_600_000
        expectedIntervals = Math.max(1, Math.round(diffHours * 4))
      } else {
        expectedIntervals = getExpectedIntervals(timeRange)
      }

      const readingsMap = new Map<string, number>()
      for (const [stationRef, total] of totals) {
        const count = counts.get(stationRef) ?? 1
        readingsMap.set(stationRef, (total / count) * expectedIntervals)
      }
      return readingsMap
    },
    enabled: timeRange !== 'custom' || !!(customRange?.from && customRange?.to),
    refetchInterval: timeRange === 'custom' ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })
}
