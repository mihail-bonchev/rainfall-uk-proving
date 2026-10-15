const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fetchEaStations, parseAreas, assignArea, buildEaRows } = require('./stations');

const station = (ref, lat = 52, long = -1) => ({ stationReference: ref, label: `Gauge ${ref}`, lat, long, gridReference: 'SP000000' });
const square = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];

describe('fetchEaStations', () => {
  test('pages until a page adds nothing new, de-duplicating and skipping gauges without coordinates', async () => {
    const pages = [
      [station('A'), station('B'), station('B'), { stationReference: 'NOLAT', lat: null, long: null }],
      [station('C')],
      [],
    ];
    const urls = [];
    const fakeFetch = async (url) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get('_offset'));
      return { ok: true, status: 200, json: async () => ({ items: pages[offset / 1000] || [] }) };
    };
    const stations = await fetchEaStations(fakeFetch);
    assert.deepEqual(stations.map((s) => s.stationReference).sort(), ['A', 'B', 'C']);
    assert.equal(urls.length, 3);
  });

  test('throws on an HTTP error rather than returning a partial list', async () => {
    const fakeFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await assert.rejects(fetchEaStations(fakeFetch), /HTTP 503/);
  });
});

describe('parseAreas + assignArea', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      { properties: { short_name: 'West' }, geometry: { type: 'Polygon', coordinates: [...square(-3, 51, -2, 52), [[-2.6, 51.4], [-2.4, 51.4], [-2.4, 51.6], [-2.6, 51.6], [-2.6, 51.4]]] } },
      { properties: { short_name: 'East' }, geometry: { type: 'MultiPolygon', coordinates: [square(0, 51, 1, 52), square(1.5, 51, 2, 52)] } },
    ],
  };
  const areas = parseAreas(geojson);

  test('finds the containing area, including either part of a MultiPolygon', () => {
    assert.equal(assignArea(-2.9, 51.1, areas), 'West');
    assert.equal(assignArea(0.5, 51.5, areas), 'East');
    assert.equal(assignArea(1.7, 51.5, areas), 'East');
  });

  test('a point in a hole or outside every area has no region', () => {
    assert.equal(assignArea(-2.5, 51.5, areas), null);
    assert.equal(assignArea(-5, 55, areas), null);
  });
});

describe('buildEaRows', () => {
  test('maps EA stations to provider-aware rows with region and timestamp', () => {
    const areas = parseAreas({ type: 'FeatureCollection', features: [{ properties: { short_name: 'Thames' }, geometry: { type: 'Polygon', coordinates: square(-2, 51, 0, 52) } }] });
    const [row] = buildEaRows([station('E1', 51.5, -1)], areas, '2026-10-15T00:00:00.000Z');
    assert.deepEqual(row, {
      station_ref: 'E1', provider: 'ea', nation: 'England', region: 'Thames', label: 'Gauge E1',
      lat: 51.5, long: -1, grid_ref: 'SP000000', updated_at: '2026-10-15T00:00:00.000Z',
    });
  });

  test('an EA gauge outside every EA area is over the border in Wales', () => {
    const areas = parseAreas({ type: 'FeatureCollection', features: [{ properties: { short_name: 'West Midlands' }, geometry: { type: 'Polygon', coordinates: square(-3, 52, -1, 53) } }] });
    const [row] = buildEaRows([station('1221', 52.657, -3.132)], areas, '2026-10-15T00:00:00.000Z');
    assert.equal(row.region, null);
    assert.equal(row.nation, 'Wales');
  });
});
