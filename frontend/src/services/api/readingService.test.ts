import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw/server'
import { fetchLatestReadings, fetchReadings, ReadingFetchError } from './readingService'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

function makeRawReading(stationRef: string, value: number, dateTime = '2025-11-21T14:30:00Z') {
  return {
    stationReference: stationRef,
    value,
    dateTime,
    measure: `${EA_BASE}/id/measures/${stationRef}-rainfall-mm`,
  }
}

describe('fetchLatestReadings', () => {
  it('returns normalised readings with explicit stationReference', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({ items: [makeRawReading('E0001', 1.2)] }),
      ),
    )
    const readings = await fetchLatestReadings()
    expect(readings).toHaveLength(1)
    expect(readings[0]).toMatchObject({ stationRef: 'E0001', value: 1.2 })
  })

  it('extracts stationRef from measure URL when stationReference field is absent (real API format)', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [{
            dateTime: '2025-11-21T14:30:00Z',
            measure: `${EA_BASE}/id/measures/E7050-rainfall-tipping_bucket_raingauge-t-15_min-mm`,
            value: 0.4,
          }],
        }),
      ),
    )
    const readings = await fetchLatestReadings()
    expect(readings).toHaveLength(1)
    expect(readings[0].stationRef).toBe('E7050')
    expect(readings[0].value).toBe(0.4)
  })

  it('filters out readings with null or negative values', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [
            makeRawReading('E0001', 0.5),
            { ...makeRawReading('E0002', -1), value: -1 },
            { ...makeRawReading('E0003', 0), value: null },
          ],
        }),
      ),
    )
    const readings = await fetchLatestReadings()
    expect(readings).toHaveLength(1)
    expect(readings[0].stationRef).toBe('E0001')
  })

  it('throws ReadingFetchError on non-200 response', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({ message: 'Server Error' }, { status: 503 }),
      ),
    )
    await expect(fetchLatestReadings()).rejects.toThrow(ReadingFetchError)
    await expect(fetchLatestReadings()).rejects.toMatchObject({ status: 503 })
  })
})

describe('fetchReadings', () => {
  it('passes startdate and enddate parameters to the API', async () => {
    let capturedUrl = ''
    server.use(
      http.get(`${EA_BASE}/data/readings`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ items: [] })
      }),
    )
    await fetchReadings({ startdate: '2025-11-14', enddate: '2025-11-21' })
    const params = new URL(capturedUrl).searchParams
    expect(params.get('startdate')).toBe('2025-11-14')
    expect(params.get('enddate')).toBe('2025-11-21')
  })

  it('filters readings by fromMs when provided', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [
            makeRawReading('E0001', 1.0, '2025-11-21T08:00:00Z'),
            makeRawReading('E0001', 2.0, '2025-11-21T10:00:00Z'),
          ],
        }),
      ),
    )
    const fromMs = new Date('2025-11-21T09:00:00Z').getTime()
    const result = await fetchReadings({ startdate: '2025-11-21', enddate: '2025-11-21', fromMs })
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(2.0)
  })

  it('throws ReadingFetchError on non-200 response', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    await expect(fetchReadings({ startdate: '2025-11-21', enddate: '2025-11-21' })).rejects.toThrow(ReadingFetchError)
  })
})
