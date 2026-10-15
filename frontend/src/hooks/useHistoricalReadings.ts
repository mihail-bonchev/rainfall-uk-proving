import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { supabase } from '../services/db/supabaseClient'
import { HISTORICAL_DAYS, type HistoricalRange } from '../types/api'

const PAGE_SIZE = 1000

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
      // Server-side SUM+GROUP BY via RPC: one row per station. With Scotland that is
      // > 1,000 rows, so page in station order — PostgREST silently caps each response at 1,000.
      const readingsMap = new Map<string, number>()
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .rpc('get_station_totals', { p_start: startDateStr, p_end: todayStr })
          .order('station_ref')
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw new Error(error.message)
        const rows = (data ?? []) as { station_ref: string; total_mm: string | number }[]
        // PostgREST returns NUMERIC columns as strings — coerce explicitly.
        for (const row of rows) readingsMap.set(row.station_ref, Number(row.total_mm))
        if (rows.length < PAGE_SIZE) break
      }
      return readingsMap
    },
    enabled: options.enabled !== false,
    staleTime: 60 * 60 * 1000,
  })
}
