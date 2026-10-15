import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw/server'
import { fetchSepaLatest, fetchSepaStationReadings } from './sepaService'

const KIWIS = 'https://timeseries.sepa.org.uk/KiWIS/KiWIS'
const NOW = Date.parse('2026-10-15T18:00:00Z')

describe('fetchSepaLatest', () => {
  it('keys recent values by sepa:<station_no>, dropping stale, null and negative values', async () => {
    server.use(
      http.get(KIWIS, () =>
        HttpResponse.json([
          { station_no: '115225', timestamp: '2026-10-15T17:45:00.000Z', ts_value: 0.4 },
          { station_no: '115239', timestamp: '2026-10-15T17:45:00.000Z', ts_value: 0 },
          { station_no: '999', timestamp: '2026-10-10T09:00:00.000Z', ts_value: 3 },
          { station_no: '888', timestamp: '2026-10-15T17:45:00.000Z', ts_value: null },
          { station_no: '777', timestamp: '2026-10-15T17:45:00.000Z', ts_value: -1 },
        ]),
      ),
    )
    const latest = await fetchSepaLatest(NOW)
    expect(Object.fromEntries(latest)).toEqual({ 'sepa:115225': 0.4, 'sepa:115239': 0 })
  })

  it('throws on an HTTP error', async () => {
    server.use(http.get(KIWIS, () => new HttpResponse(null, { status: 503 })))
    await expect(fetchSepaLatest(NOW)).rejects.toThrow(/503/)
  })
})

describe('fetchSepaStationReadings', () => {
  it("requests that gauge's 15-min series and maps it to readings, dropping nulls", async () => {
    let url = ''
    server.use(
      http.get(KIWIS, ({ request }) => {
        url = request.url
        return HttpResponse.json([
          { data: [['2026-10-15T17:30:00.000Z', 0.2], ['2026-10-15T17:45:00.000Z', null], ['2026-10-15T18:00:00.000Z', 0]] },
        ])
      }),
    )
    const readings = await fetchSepaStationReadings('sepa:115225', new Date('2026-10-15T12:00:00Z'), new Date('2026-10-15T18:00:00Z'))
    expect(new URL(url).searchParams.get('ts_path')).toBe('1/115225/RE/15m.Total')
    expect(readings).toEqual([
      { stationRef: 'sepa:115225', dateTime: '2026-10-15T17:30:00.000Z', value: 0.2 },
      { stationRef: 'sepa:115225', dateTime: '2026-10-15T18:00:00.000Z', value: 0 },
    ])
  })
})
