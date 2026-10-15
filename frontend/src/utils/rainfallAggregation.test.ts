import { describe, it, expect } from 'vitest'
import { toWeekly } from './rainfallAggregation'

describe('toWeekly', () => {
  it('sums daily totals into 7-day buckets labelled by their first day', () => {
    const daily = Array.from({ length: 10 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, value: 1 }))
    expect(toWeekly(daily)).toEqual([
      { date: '2026-07-01', value: 7 },
      { date: '2026-07-08', value: 3 },
    ])
  })

  it('returns no weeks for no days', () => {
    expect(toWeekly([])).toEqual([])
  })
})
