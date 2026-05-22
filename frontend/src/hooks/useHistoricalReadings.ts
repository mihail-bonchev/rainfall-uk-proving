import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { supabase } from '../services/db/supabaseClient'

// PostgREST names aggregate result columns by function name, not original column name.
// NUMERIC aggregate values are returned as strings just like plain NUMERIC columns.
type AggRow = { station_ref: string; sum: string }

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
      // Aggregate on the server: one row per station instead of one row per station-day.
      // Without this, the default 1000-row PostgREST limit truncates 7d to ~1 day of data
      // and 28d to ~1/28th coverage, producing artificially low averages.
      const { data, error } = await supabase
        .from('station_daily_totals')
        .select('station_ref, total_mm.sum()')
        .gte('date', startDateStr)
        .lt('date', todayStr)

      if (error) throw new Error(error.message)

      const readingsMap = new Map<string, number>()
      for (const row of (data ?? []) as unknown as AggRow[]) {
        readingsMap.set(row.station_ref, Number(row.sum))
      }
      return readingsMap
    },
    enabled: options.enabled !== false,
    staleTime: 60 * 60 * 1000,
  })
}
