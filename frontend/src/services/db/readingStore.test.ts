import { describe, it, expect, beforeEach } from 'vitest'
import { _resetDbForTests } from './dbInit'
import { upsertReadings, getReadingsByStation, getReadingsSince } from './readingStore'
import type { Reading } from '../../types/api'

function makeReading(stationRef: string, value: number, dateTime: string): Reading {
  return { stationRef, value, dateTime, measure: 'test-measure' }
}

describe('readingStore', () => {
  beforeEach(async () => {
    await _resetDbForTests()
  })

  describe('upsertReadings', () => {
    it('stores readings without duplicates on compound key', async () => {
      const r = makeReading('E0001', 1.2, '2025-11-21T14:30:00Z')
      await upsertReadings([r, r])
      const results = await getReadingsByStation(
        'E0001',
        new Date('2025-11-21T00:00:00Z'),
        new Date('2025-11-22T00:00:00Z'),
      )
      expect(results).toHaveLength(1)
    })

    it('is idempotent — re-upserting same reading updates it in place', async () => {
      await upsertReadings([makeReading('E0001', 1.2, '2025-11-21T14:30:00Z')])
      await upsertReadings([makeReading('E0001', 2.5, '2025-11-21T14:30:00Z')])
      const results = await getReadingsByStation(
        'E0001',
        new Date('2025-11-21T00:00:00Z'),
        new Date('2025-11-22T00:00:00Z'),
      )
      expect(results).toHaveLength(1)
      expect(results[0].value).toBe(2.5)
    })

    it('is a no-op for empty array', async () => {
      await expect(upsertReadings([])).resolves.toBeUndefined()
    })
  })

  describe('getReadingsByStation', () => {
    it('returns readings within the date range for the given station', async () => {
      await upsertReadings([
        makeReading('E0001', 1.0, '2025-11-21T10:00:00Z'),
        makeReading('E0001', 2.0, '2025-11-21T14:00:00Z'),
        makeReading('E0001', 3.0, '2025-11-21T20:00:00Z'),
        makeReading('E0002', 5.0, '2025-11-21T14:00:00Z'),
      ])

      const results = await getReadingsByStation(
        'E0001',
        new Date('2025-11-21T12:00:00Z'),
        new Date('2025-11-21T18:00:00Z'),
      )
      expect(results).toHaveLength(1)
      expect(results[0].value).toBe(2.0)
    })

    it('only returns readings for the requested station', async () => {
      await upsertReadings([
        makeReading('E0001', 1.0, '2025-11-21T14:00:00Z'),
        makeReading('E0002', 2.0, '2025-11-21T14:00:00Z'),
      ])
      const results = await getReadingsByStation(
        'E0001',
        new Date('2025-11-21T00:00:00Z'),
        new Date('2025-11-22T00:00:00Z'),
      )
      expect(results.every((r) => r.stationRef === 'E0001')).toBe(true)
    })
  })

  describe('getReadingsSince', () => {
    it('returns all readings newer than the given date', async () => {
      await upsertReadings([
        makeReading('E0001', 1.0, '2025-11-21T10:00:00Z'),
        makeReading('E0002', 2.0, '2025-11-21T12:00:00Z'),
        makeReading('E0003', 3.0, '2025-11-21T16:00:00Z'),
      ])

      const results = await getReadingsSince(new Date('2025-11-21T11:00:00Z'))
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.stationRef).sort()).toEqual(['E0002', 'E0003'])
    })

    it('returns empty array when no readings match', async () => {
      await upsertReadings([makeReading('E0001', 1.0, '2025-11-21T10:00:00Z')])
      const results = await getReadingsSince(new Date('2025-11-22T00:00:00Z'))
      expect(results).toHaveLength(0)
    })
  })
})
