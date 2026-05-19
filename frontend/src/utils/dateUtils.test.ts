import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDateRangeForPreset, getFromDate } from './dateUtils'

const FIXED_NOW = new Date('2025-11-21T15:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getDateRangeForPreset', () => {
  it('15m: returns since = 15 minutes ago as ISO string', () => {
    const result = getDateRangeForPreset('15m')
    expect(result.since).toBe('2025-11-21T14:45:00.000Z')
    expect(result.startdate).toBeUndefined()
  })

  it('6h: returns since = 6 hours ago', () => {
    const result = getDateRangeForPreset('6h')
    expect(result.since).toBe('2025-11-21T09:00:00.000Z')
  })

  it('24h: returns since = 24 hours ago', () => {
    const result = getDateRangeForPreset('24h')
    expect(result.since).toBe('2025-11-20T15:00:00.000Z')
  })

  it('7d: returns startdate 7 days ago and enddate today', () => {
    const result = getDateRangeForPreset('7d')
    expect(result.startdate).toBe('2025-11-14')
    expect(result.enddate).toBe('2025-11-21')
    expect(result.since).toBeUndefined()
  })

  it('28d: returns startdate 28 days ago and enddate today', () => {
    const result = getDateRangeForPreset('28d')
    expect(result.startdate).toBe('2025-10-24')
    expect(result.enddate).toBe('2025-11-21')
  })

  it('custom: falls back to 15m range', () => {
    const result = getDateRangeForPreset('custom')
    expect(result.since).toBe('2025-11-21T14:45:00.000Z')
  })
})

describe('getFromDate', () => {
  it('15m: returns date 15 minutes before now', () => {
    const d = getFromDate('15m')
    expect(d.toISOString()).toBe('2025-11-21T14:45:00.000Z')
  })

  it('7d: returns date 7 days before now', () => {
    const d = getFromDate('7d')
    expect(d.toISOString()).toBe('2025-11-14T15:00:00.000Z')
  })
})
