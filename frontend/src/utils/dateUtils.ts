import type { TimeRange } from '../types/api'

export interface DateRangeParams {
  startdate: string
  enddate: string
  fromMs?: number // client-side lower bound for filtering
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
    case '15m': {
      const from = new Date(now.getTime() - 15 * 60 * 1000)
      return { startdate: toDateStr(from), enddate: toDateStr(now), fromMs: from.getTime() }
    }
    case '6h': {
      const from = new Date(now.getTime() - 6 * 60 * 60 * 1000)
      return { startdate: toDateStr(from), enddate: toDateStr(now), fromMs: from.getTime() }
    }
    case '24h': {
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      return { startdate: toDateStr(from), enddate: toDateStr(now), fromMs: from.getTime() }
    }
    case '7d': {
      const from = new Date(now)
      from.setDate(from.getDate() - 7)
      return { startdate: toDateStr(from), enddate: toDateStr(now) }
    }
    case '28d': {
      const from = new Date(now)
      from.setDate(from.getDate() - 28)
      return { startdate: toDateStr(from), enddate: toDateStr(now) }
    }
    case '3m': {
      const from = new Date(now)
      from.setDate(from.getDate() - 90)
      return { startdate: toDateStr(from), enddate: toDateStr(now) }
    }
    default: {
      const from = new Date(now.getTime() - 15 * 60 * 1000)
      return { startdate: toDateStr(from), enddate: toDateStr(now), fromMs: from.getTime() }
    }
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
    case '3m': {
      const d = new Date(now)
      d.setDate(d.getDate() - 90)
      return d
    }
    default:
      return new Date(now.getTime() - 15 * 60 * 1000)
  }
}
