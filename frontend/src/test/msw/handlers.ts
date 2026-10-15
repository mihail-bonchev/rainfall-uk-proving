import { http, HttpResponse } from 'msw'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }

export const handlers = [
  http.get('/data/ea-areas.geojson', () => HttpResponse.json(EMPTY_GEOJSON)),
  http.get('/data/uk-countries.geojson', () => HttpResponse.json(EMPTY_GEOJSON)),

  http.get('/api/rainfall-totals', () => HttpResponse.json({ totals: {} })),

  // SEPA KiWIS (Scotland) — empty by default; tests override with server.use(...).
  http.get('https://timeseries.sepa.org.uk/KiWIS/KiWIS', () => HttpResponse.json([])),

  // Supabase get_stations RPC (placeholder VITE_SUPABASE_URL from vitest.config.ts).
  http.post('http://localhost:54321/rest/v1/rpc/get_stations', () =>
    HttpResponse.json([
      { station_ref: 'E0001', provider: 'ea', nation: 'England', region: 'Thames', label: 'Test Station', lat: 51.5, long: -0.1, grid_ref: 'TQ123456' },
    ]),
  ),

  http.get(`${EA_BASE}/id/stations`, () => {
    return HttpResponse.json({
      meta: { totalCount: 1027 },
      items: [
        {
          '@id': `${EA_BASE}/id/stations/E0001`,
          stationReference: 'E0001',
          label: 'Test Station',
          lat: 51.5,
          long: -0.1,
          eaAreaName: 'Thames',
          gridReference: 'TQ123456',
        },
      ],
    })
  }),

  http.get(`${EA_BASE}/id/stations/:id`, ({ params }) => {
    return HttpResponse.json({
      items: {
        '@id': `${EA_BASE}/id/stations/${params.id}`,
        stationReference: params.id,
        label: 'Test Station',
        lat: 51.5,
        long: -0.1,
        eaAreaName: 'Thames',
      },
    })
  }),

  http.get(`${EA_BASE}/data/readings`, () => {
    return HttpResponse.json({
      items: [
        {
          stationReference: 'E0001',
          value: 1.2,
          dateTime: '2025-11-21T14:30:00Z',
          measure: `${EA_BASE}/id/measures/E0001-rainfall-tipping_bucket_raingauge-t-15_min-mm`,
        },
        {
          stationReference: 'E0002',
          value: 0.4,
          dateTime: '2025-11-21T14:30:00Z',
          measure: `${EA_BASE}/id/measures/E0002-rainfall-tipping_bucket_raingauge-t-15_min-mm`,
        },
      ],
    })
  }),
]
