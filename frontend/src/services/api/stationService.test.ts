import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw/server'
import { fetchAllStations, StationFetchError } from './stationService'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

function makeRawStation(n: number) {
  return {
    stationReference: `E${String(n).padStart(4, '0')}`,
    label: `Station ${n}`,
    lat: 51 + n * 0.01,
    long: -0.1 + n * 0.01,
    eaAreaName: 'Thames',
    gridReference: `TQ${n}`,
  }
}

describe('fetchAllStations', () => {
  it('returns normalised stations for a single page', async () => {
    server.use(
      http.get(`${EA_BASE}/id/stations`, () =>
        HttpResponse.json({
          meta: { totalCount: 2 },
          items: [makeRawStation(1), makeRawStation(2)],
        }),
      ),
    )

    const stations = await fetchAllStations()

    expect(stations).toHaveLength(2)
    expect(stations[0]).toMatchObject({
      id: 'E0001',
      label: 'Station 1',
      eaAreaName: 'Thames',
      gridReference: 'TQ1',
    })
    expect(stations[0].lat).toBeCloseTo(51.01)
    expect(stations[0].long).toBeCloseTo(-0.09)
  })

  it('keeps paging until an empty page, without relying on meta.totalCount', async () => {
    let callCount = 0
    server.use(
      http.get(`${EA_BASE}/id/stations`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('_offset') ?? '0')
        callCount++
        if (offset === 0) return HttpResponse.json({ items: [makeRawStation(1), makeRawStation(2)] })
        if (offset === 500) return HttpResponse.json({ items: [makeRawStation(3)] })
        return HttpResponse.json({ items: [] })
      }),
    )

    const stations = await fetchAllStations()

    expect(callCount).toBe(3)
    expect(stations).toHaveLength(3)
    expect(stations[2].id).toBe('E0003')
  })

  it('uses station count as total when meta is absent', async () => {
    server.use(
      http.get(`${EA_BASE}/id/stations`, () =>
        HttpResponse.json({
          items: [makeRawStation(1)],
        }),
      ),
    )

    const stations = await fetchAllStations()
    expect(stations).toHaveLength(1)
  })

  it('throws StationFetchError on non-200 response', async () => {
    server.use(
      http.get(`${EA_BASE}/id/stations`, () =>
        HttpResponse.json({ message: 'Server Error' }, { status: 503 }),
      ),
    )

    await expect(fetchAllStations()).rejects.toThrow(StationFetchError)
    await expect(fetchAllStations()).rejects.toMatchObject({ status: 503 })
  })

  it('fills missing optional fields with empty string', async () => {
    server.use(
      http.get(`${EA_BASE}/id/stations`, () =>
        HttpResponse.json({
          items: [
            {
              stationReference: 'X001',
              label: 'No extras',
              lat: 52.0,
              long: -1.0,
            },
          ],
        }),
      ),
    )

    const [station] = await fetchAllStations()
    expect(station.eaAreaName).toBe('')
    expect(station.gridReference).toBe('')
  })
})
