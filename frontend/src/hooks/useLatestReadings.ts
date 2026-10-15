import { queryOptions, useQuery } from '@tanstack/react-query'
import type { DateRange } from 'react-day-picker'
import { isHistoricalRange, type TimeRange } from '../types/api'
import { fetchLatestReadings, fetchReadings, fetchRecentTotals } from '../services/api/readingService'
import { upsertReadings } from '../services/db/readingStore'
import { fetchSepaLatest } from '../services/api/sepaService'
import { getDateRangeForPreset, getDateRangeForCustom } from '../utils/dateUtils'
import { useHistoricalReadings } from './useHistoricalReadings'

// Shared by the map and the background warm-up so both use one cache entry.
export function recentTotalsQuery(range: '6h' | '24h') {
  return queryOptions({
    queryKey: ['recent-totals', range],
    queryFn: () => fetchRecentTotals(range === '6h' ? 6 : 24),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60_000,
  })
}

/**
 * Starts loading 6h/24h totals as soon as the app opens (they can take up to a
 * minute on a cold server cache) and reports which are still on first load.
 */
export function useRecentTotalsWarmup(): Partial<Record<TimeRange, boolean>> {
  const sixHours = useQuery(recentTotalsQuery('6h'))
  const day = useQuery(recentTotalsQuery('24h'))
  return { '6h': sixHours.isPending, '24h': day.isPending }
}

export function useLatestReadings(timeRange: TimeRange, customRange?: DateRange) {
  const isHistorical = isHistoricalRange(timeRange)
  const isRecentTotals = timeRange === '6h' || timeRange === '24h'

  const historicalResult = useHistoricalReadings(
    isHistorical ? timeRange : '7d',
    { enabled: isHistorical },
  )

  const totalsResult = useQuery({
    ...recentTotalsQuery(timeRange === '24h' ? '24h' : '6h'),
    enabled: isRecentTotals,
  })

  const eaResult = useQuery<Map<string, number>>({
    queryKey: ['readings', timeRange, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async () => {
      // Scotland (SEPA) only has a live 15-min feed here; it's best effort so England never waits on it failing.
      const sepaLatest = timeRange === '15m' ? fetchSepaLatest().catch(() => new Map<string, number>()) : null
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
        for (const [ref, mm] of await sepaLatest!) readingsMap.set(ref, mm)
        return readingsMap
      }

      const readingsMap = new Map<string, number>()
      for (const r of readings) {
        readingsMap.set(r.stationRef, (readingsMap.get(r.stationRef) ?? 0) + r.value)
      }
      return readingsMap
    },
    enabled: !isHistorical && !isRecentTotals && (timeRange !== 'custom' || !!(customRange?.from && customRange?.to)),
    refetchInterval: timeRange === 'custom' ? false : 30_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  if (isHistorical) return historicalResult
  return isRecentTotals ? totalsResult : eaResult
}
