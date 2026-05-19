import type { TimeRange } from '../types/api'

export interface DateRangeParams {
  since?: string
  startdate?: string
  enddate?: string
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getDateRangeForCustom(from: Date, to: Date): DateRangeParams {
  return { startdate: toDateStr(from), enddate: toDateStr(to) }
}

export function getDateRangeForPreset(preset: TimeRange): DateRangeParams {
  const now = new Date()
  switch (preset) {
    case '15m':
      return { since: new Date(now.getTime() - 15 * 60 * 1000).toISOString() }
    case '6h':
      return { since: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString() }
    case '24h':
      return { since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() }
    case '7d': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      return { startdate: toDateStr(start), enddate: toDateStr(now) }
    }
    case '28d': {
      const start = new Date(now)
      start.setDate(start.getDate() - 28)
      return { startdate: toDateStr(start), enddate: toDateStr(now) }
    }
    default:
      return { since: new Date(now.getTime() - 15 * 60 * 1000).toISOString() }
  }
}

export function getFromDate(preset: TimeRange): Date {
  const now = new Date()
  switch (preset) {
    case '15m':
      return new Date(now.getTime() - 15 * 60 * 1000)
    case '6h':
      return new Date(now.getTime() - 6 * 60 * 60 * 1000)
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    case '7d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return d
    }
    case '28d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 28)
      return d
    }
    default:
      return new Date(now.getTime() - 15 * 60 * 1000)
  }
}
