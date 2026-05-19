import { http, HttpResponse } from 'msw'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] }

export const handlers = [
  http.get('/data/ea-areas.geojson', () => HttpResponse.json(EMPTY_GEOJSON)),


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
]
