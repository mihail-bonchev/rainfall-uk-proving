/**
 * Smoke tests for the EA Flood Monitoring API contract.
 *
 * These hit the REAL network — run with:  npm run test:smoke
 * They are intentionally excluded from `npm run test:run` (CI).
 *
 * Purpose: catch API contract drift before it reaches production.
 * Lesson learned: MSW mocks always accept any params so contract breaks go
 * undetected until production. These tests assert the fields we actually rely
 * on exist (and the fields that DON'T exist, stay absent).
 */

import { describe, it, expect } from 'vitest'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

// Re-implement the extractor here so the smoke test is self-contained and
// stays honest — if we ever change the real implementation, the test will
// tell us whether the new logic also works against the live API.
function stationRefFromMeasure(measure: string): string {
  const id = measure.split('/').pop() ?? ''
  const idx = id.indexOf('-rainfall-')
  return idx > 0 ? id.slice(0, idx) : id.split('-')[0]
}

describe('EA API contract — /data/readings (latest)', () => {
  it('returns 200 with an items array', async () => {
    const res = await fetch(
      `${EA_BASE}/data/readings?parameter=rainfall&latest&_limit=10`,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { items: unknown[] }
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBeGreaterThan(0)
  })

  it('items have dateTime, measure, and value — but NOT stationReference', async () => {
    const res = await fetch(
      `${EA_BASE}/data/readings?parameter=rainfall&latest&_limit=10`,
    )
    const body = await res.json() as { items: Record<string, unknown>[] }
    const item = body.items[0]

    // Fields we depend on
    expect(typeof item.dateTime).toBe('string')
    expect(typeof item.measure).toBe('string')
    expect(typeof item.value === 'number' || item.value === null).toBe(true)

    // stationReference is ABSENT on the bulk endpoint — document this so we
    // notice immediately if the API ever starts including it (which would
    // allow us to simplify stationRefFromMeasure).
    expect(Object.prototype.hasOwnProperty.call(item, 'stationReference')).toBe(false)
  })

  it('stationRef can be extracted from the measure URL for all items', async () => {
    const res = await fetch(
      `${EA_BASE}/data/readings?parameter=rainfall&latest&_limit=50`,
    )
    const body = await res.json() as { items: { measure: string; value: number | null }[] }

    const failed: string[] = []
    for (const item of body.items) {
      const ref = stationRefFromMeasure(item.measure)
      if (!ref) failed.push(item.measure)
    }
    expect(failed).toHaveLength(0)
  })
})

describe('EA API contract — /data/readings (date range)', () => {
  it('accepts startdate/enddate parameters and returns items', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await fetch(
      `${EA_BASE}/data/readings?parameter=rainfall&startdate=${today}&enddate=${today}&_limit=10`,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { items: unknown[] }
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('items from date range also lack stationReference and have extractable stationRef', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const res = await fetch(
      `${EA_BASE}/data/readings?parameter=rainfall&startdate=${today}&enddate=${today}&_limit=10`,
    )
    const body = await res.json() as { items: Record<string, unknown>[] }
    if (body.items.length === 0) return // no data today yet — skip assertion

    const item = body.items[0]
    expect(Object.prototype.hasOwnProperty.call(item, 'stationReference')).toBe(false)
    expect(stationRefFromMeasure(item.measure as string)).toBeTruthy()
  })
})

describe('EA API contract — unsupported parameters', () => {
  it('?since= on /data/readings returns 400 (not supported on bulk endpoint)', async () => {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const res = await fetch(
      `${EA_BASE}/data/readings?parameter=rainfall&since=${encodeURIComponent(since)}`,
    )
    // The EA API rejects ?since on the bulk /data/readings route.
    // Individual measure endpoints support it; the bulk one does not.
    expect(res.status).toBe(400)
  })
})
