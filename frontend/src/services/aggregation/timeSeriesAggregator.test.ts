import { describe, it, expect } from 'vitest'
import { aggregateByDay, aggregateByWeek } from './timeSeriesAggregator'
import type { Reading } from '../../types/api'

function r(dateTime: string, value: number, stationRef = 'E0001'): Reading {
  return { stationRef, value, dateTime, measure: 'test' }
}

describe('aggregateByDay', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateByDay([])).toEqual([])
  })

  it('sums readings within the same day', () => {
    const result = aggregateByDay([
      r('2025-11-21T08:00:00Z', 1.0),
      r('2025-11-21T08:15:00Z', 0.5),
      r('2025-11-21T14:00:00Z', 2.0),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ date: '2025-11-21', totalMm: 3.5, count: 3 })
  })

  it('produces separate buckets for different days', () => {
    const result = aggregateByDay([
      r('2025-11-20T23:00:00Z', 1.0),
      r('2025-11-21T01:00:00Z', 2.0),
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ date: '2025-11-20', totalMm: 1.0, count: 1 })
    expect(result[1]).toEqual({ date: '2025-11-21', totalMm: 2.0, count: 1 })
  })

  it('returns results sorted ascending by date', () => {
    const result = aggregateByDay([
      r('2025-11-22T12:00:00Z', 3.0),
      r('2025-11-20T12:00:00Z', 1.0),
      r('2025-11-21T12:00:00Z', 2.0),
    ])
    expect(result.map((b) => b.date)).toEqual(['2025-11-20', '2025-11-21', '2025-11-22'])
  })

  it('count reflects number of 15-min readings per day', () => {
    const readings = Array.from({ length: 96 }, (_, i) =>
      r(`2025-11-21T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00Z`, 0.1),
    )
    const result = aggregateByDay(readings)
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(96)
  })

  it('handles sparse data without inflating totals', () => {
    const result = aggregateByDay([
      r('2025-11-14T08:00:00Z', 1.0),
      r('2025-11-21T08:00:00Z', 2.0),
    ])
    expect(result).toHaveLength(2)
    expect(result[0].totalMm).toBe(1.0)
    expect(result[1].totalMm).toBe(2.0)
  })
})

describe('aggregateByWeek', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateByWeek([])).toEqual([])
  })

  it('groups readings into Monday-starting weeks', () => {
    const result = aggregateByWeek([
      r('2025-11-17T12:00:00Z', 1.0), // Monday
      r('2025-11-18T12:00:00Z', 2.0), // Tuesday — same week
      r('2025-11-23T12:00:00Z', 3.0), // Sunday — same week
      r('2025-11-24T12:00:00Z', 4.0), // Next Monday — new week
    ])
    expect(result).toHaveLength(2)
    expect(result[0].weekStart).toBe('2025-11-17')
    expect(result[0].totalMm).toBeCloseTo(6.0)
    expect(result[0].count).toBe(3)
    expect(result[1].weekStart).toBe('2025-11-24')
    expect(result[1].totalMm).toBeCloseTo(4.0)
  })

  it('returns results sorted ascending by week start', () => {
    const result = aggregateByWeek([
      r('2025-11-24T12:00:00Z', 4.0),
      r('2025-11-10T12:00:00Z', 1.0),
      r('2025-11-17T12:00:00Z', 2.0),
    ])
    expect(result.map((b) => b.weekStart)).toEqual(['2025-11-10', '2025-11-17', '2025-11-24'])
  })

  it('handles sparse data (gaps between readings) without inflating totals', () => {
    const result = aggregateByWeek([
      r('2025-11-03T12:00:00Z', 1.0),
      r('2025-11-24T12:00:00Z', 2.0),
    ])
    expect(result).toHaveLength(2)
    expect(result[0].totalMm).toBe(1.0)
    expect(result[1].totalMm).toBe(2.0)
  })
})
