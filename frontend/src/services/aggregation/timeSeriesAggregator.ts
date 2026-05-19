import { startOfWeek } from 'date-fns'
import type { Reading } from '../../types/api'

export interface DayBucket {
  date: string
  totalMm: number
  count: number
}

export interface WeekBucket {
  weekStart: string
  totalMm: number
  count: number
}

export function aggregateByDay(readings: Reading[]): DayBucket[] {
  if (readings.length === 0) return []

  const buckets = new Map<string, { totalMm: number; count: number }>()
  for (const r of readings) {
    const date = r.dateTime.slice(0, 10)
    const existing = buckets.get(date) ?? { totalMm: 0, count: 0 }
    buckets.set(date, { totalMm: existing.totalMm + r.value, count: existing.count + 1 })
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { totalMm, count }]) => ({ date, totalMm, count }))
}

export function aggregateByWeek(readings: Reading[]): WeekBucket[] {
  if (readings.length === 0) return []

  const buckets = new Map<string, { totalMm: number; count: number }>()
  for (const r of readings) {
    const date = new Date(r.dateTime)
    const weekStart = startOfWeek(date, { weekStartsOn: 1 }).toISOString().slice(0, 10)
    const existing = buckets.get(weekStart) ?? { totalMm: 0, count: 0 }
    buckets.set(weekStart, { totalMm: existing.totalMm + r.value, count: existing.count + 1 })
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { totalMm, count }]) => ({ weekStart, totalMm, count }))
}
