import { describe, it, expect } from 'vitest'
import { accumulate, computeTotals, stationRefFromMeasure, GET, type EAReading } from '../../../api/rainfall-totals'

const measure = (ref: string) =>
  `http://environment.data.gov.uk/flood-monitoring/id/measures/${ref}-rainfall-tipping_bucket_raingauge-t-15_min-mm`
const reading = (ref: string, iso: string, value: number | null): EAReading => ({ measure: measure(ref), dateTime: iso, value })

describe('stationRefFromMeasure', () => {
  it('takes everything before -rainfall-', () => {
    expect(stationRefFromMeasure(measure('E11820'))).toBe('E11820')
  })
})

describe('accumulate', () => {
  const from = Date.parse('2026-10-06T12:00:00Z')
  const to = Date.parse('2026-10-06T18:00:00Z')

  it('sums readings inside the window per station', () => {
    const totals: Record<string, number> = {}
    accumulate(
      [reading('A', '2026-10-06T12:15:00Z', 0.4), reading('A', '2026-10-06T18:00:00Z', 0.2), reading('B', '2026-10-06T13:00:00Z', 1)],
      from, to, totals,
    )
    expect(totals).toEqual({ A: 0.6000000000000001, B: 1 })
  })

  it('ignores readings outside the window, nulls, negatives and implausible spikes', () => {
    const totals: Record<string, number> = {}
    accumulate(
      [
        reading('A', '2026-10-06T12:00:00Z', 5),
        reading('A', '2026-10-06T18:15:00Z', 5),
        reading('A', '2026-10-06T13:00:00Z', null),
        reading('A', '2026-10-06T13:15:00Z', -1),
        reading('A', '2026-10-06T13:30:00Z', 999),
      ],
      from, to, totals,
    )
    expect(totals).toEqual({})
  })
})

describe('computeTotals', () => {
  const now = Date.parse('2026-10-06T18:00:00Z')

  it('pages newest-first and stops once past the window start', async () => {
    const urls: string[] = []
    const fakeFetch = async (url: string) => {
      urls.push(url)
      const offset = Number(new URL(url).searchParams.get('_offset'))
      // Two full pages of recent readings, then one page that reaches back past the window.
      const iso = offset === 0 ? '2026-10-06T17:00:00Z' : offset === 10_000 ? '2026-10-06T14:00:00Z' : '2026-10-06T11:00:00Z'
      const items = new Array(10_000).fill(reading('S1', iso, 0.01))
      return { ok: true, status: 200, json: async () => ({ items }) }
    }
    const result = await computeTotals(6, now, fakeFetch)
    expect(urls.every((u) => u.includes('_sorted'))).toBe(true)
    expect(urls).toHaveLength(4)
    expect(result.totals.S1).toBe(200)
    expect(result.stationCount).toBe(1)
  })

  it('retries a 503 before giving up', async () => {
    let calls = 0
    const flaky = async () => {
      calls++
      return calls === 1
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ items: [] }) }
    }
    const result = await computeTotals(6, now, flaky)
    expect(result.stationCount).toBe(0)
    expect(calls).toBeGreaterThan(1)
  })
})

describe('GET', () => {
  it('rejects unsupported hours', async () => {
    const res = await GET(new Request('http://x/api/rainfall-totals?hours=5'))
    expect(res.status).toBe(400)
  })
})
