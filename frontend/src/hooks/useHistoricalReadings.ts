import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { supabase } from '../services/db/supabaseClient'
import { HISTORICAL_DAYS, type HistoricalRange } from '../types/api'

export function useHistoricalReadings(
  timeRange: HistoricalRange,
  options: { enabled?: boolean } = {},
): UseQueryResult<Map<string, number>> {
  const days = HISTORICAL_DAYS[timeRange]

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const startDate = new Date(today)
  startDate.setUTCDate(startDate.getUTCDate() - days)
  const startDateStr = startDate.toISOString().slice(0, 10)

  return useQuery<Map<string, number>>({
    queryKey: ['historical-readings', timeRange, startDateStr],
    queryFn: async () => {
      // Server-side SUM+GROUP BY via RPC: returns one row per station (~900 rows),
      // avoiding PostgREST's 1000-row default which truncated the raw station-day table.
      const { data, error } = await supabase
        .rpc('get_station_totals', { p_start: startDateStr, p_end: todayStr })

      if (error) throw new Error(error.message)

      const readingsMap = new Map<string, number>()
      for (const row of data ?? []) {
        // PostgREST returns NUMERIC columns as strings — coerce explicitly.
        readingsMap.set(row.station_ref, Number(row.total_mm))
      }
      return readingsMap
    },
    enabled: options.enabled !== false,
    staleTime: 60 * 60 * 1000,
  })
}
