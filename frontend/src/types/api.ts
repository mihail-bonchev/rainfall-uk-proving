export interface Reading {
  stationRef: string
  value: number
  dateTime: string
  measure?: string
}

export type TimeRange = '15m' | '6h' | '24h' | '7d' | '28d' | 'custom'
