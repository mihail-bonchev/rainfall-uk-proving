import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { supabase } from '../services/db/supabaseClient'

export function useHistoricalReadings(
  timeRange: '7d' | '28d',
  options: { enabled?: boolean } = {},
): UseQueryResult<Map<string, number>> {
  const days = timeRange === '7d' ? 7 : 28

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const startDate = new Date(today)
  startDate.setUTCDate(startDate.getUTCDate() - days)
  const startDateStr = startDate.toISOString().slice(0, 10)

  return useQuery<Map<string, number>>({
    queryKey: ['historical-readings', timeRange, startDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('station_daily_totals')
        .select('station_ref, total_mm')
        .gte('date', startDateStr)
        .lt('date', todayStr)

      if (error) throw new Error(error.message)

      const readingsMap = new Map<string, number>()
      for (const row of data ?? []) {
        readingsMap.set(row.station_ref, (readingsMap.get(row.station_ref) ?? 0) + row.total_mm)
      }
      return readingsMap
    },
    enabled: options.enabled !== false,
    staleTime: 60 * 60 * 1000,
  })
}
