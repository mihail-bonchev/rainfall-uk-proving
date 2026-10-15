import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw/server'
import { fetchSepaLatest } from './sepaService'

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
