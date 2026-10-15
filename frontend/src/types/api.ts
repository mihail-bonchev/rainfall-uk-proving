export interface Reading {
  stationRef: string
  value: number
  dateTime: string
  measure?: string
}

export type TimeRange = '15m' | '6h' | '24h' | '7d' | '28d' | '3m' | 'custom'

/** Ranges served from Supabase daily totals (whole days, complete to yesterday). */
export type HistoricalRange = '7d' | '28d' | '3m'

export const HISTORICAL_DAYS: Record<HistoricalRange, number> = { '7d': 7, '28d': 28, '3m': 90 }

export function isHistoricalRange(range: TimeRange): range is HistoricalRange {
  return range in HISTORICAL_DAYS
}
