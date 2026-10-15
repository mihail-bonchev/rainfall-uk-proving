const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const sepa = require('./sepa');

const fixture = (name) => require(path.join(__dirname, '..', 'fixtures', 'sepa', name));
const fakeFetch = (body) => async () => ({ ok: true, status: 200, json: async () => body });

describe('fetchStations', () => {
  test('parses the KiWIS table, skipping rows without a number or coordinates and de-duplicating', async () => {
    const stations = await sepa.fetchStations(fakeFetch(fixture('list.json')));
    assert.equal(stations.length, 4);
    assert.deepEqual(stations[0], { ref: 'sepa:115225', stationNo: '115225', label: 'Glenmore Lodge No 2', lat: 57.16421784, long: -3.677609728 });
  });
});

describe('fetchLatest', () => {
  test('returns the latest 15-min value per gauge, dropping null and negative values', async () => {
    const latest = await sepa.fetchLatest(fakeFetch(fixture('layer.json')));
    assert.equal(latest.length, 4);
    assert.ok(latest.every((x) => x.ref.startsWith('sepa:') && x.value >= 0 && x.time));
  });
});

describe('fetchHourlyTotals', () => {
  test('maps every gauge to [endTimeMs, mm] points and puts both timestamps in the URL', async () => {
    let url;
    const hourly = await sepa.fetchHourlyTotals('2026-10-13T00:00:00Z', '2026-10-15T00:00:00Z', async (u) => {
      url = u;
      return { ok: true, status: 200, json: async () => fixture('hourly.json') };
    });
    assert.match(url, /Hour\.Total/);
    assert.match(url, /from=2026-10-13T00%3A00%3A00Z/);
    assert.equal(hourly.size, 4);
    const points = hourly.get('sepa:115239');
    assert.equal(points.length, 49);
    assert.equal(points[0][0], Date.parse('2026-10-13T00:00:00Z'));
  });
});

describe('sumWindow', () => {
  const points = [[Date.parse('2026-10-14T22:00:00Z'), 1], [Date.parse('2026-10-14T23:00:00Z'), 2], [Date.parse('2026-10-15T00:00:00Z'), 4]];
  test('includes hours ending inside (from, to] only', () => {
    assert.equal(sepa.sumWindow(points, Date.parse('2026-10-14T22:00:00Z'), Date.parse('2026-10-15T00:00:00Z')), 6);
  });
});

describe('dailyTotals', () => {
  test('an hour ending at 00:00 belongs to the previous day; full days have 24 hours', async () => {
    const hourly = await sepa.fetchHourlyTotals('x', 'y', fakeFetch(fixture('hourly.json')));
    const points = hourly.get('sepa:115239');
    const days = sepa.dailyTotals(points);
    assert.equal(days.get('2026-10-12').hours, 1); // the 13 Oct 00:00 stamp
    assert.equal(days.get('2026-10-13').hours, 24);
    assert.equal(days.get('2026-10-14').hours, 24);
    const expected14 = points
      .filter(([t]) => t > Date.parse('2026-10-14T00:00:00Z') && t <= Date.parse('2026-10-15T00:00:00Z'))
      .reduce((a, [, v]) => a + v, 0);
    assert.equal(days.get('2026-10-14').total, Math.round(expected14 * 100) / 100);
  });
});

describe('retries', () => {
  test('retries a 503 and a dropped connection, then succeeds', async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      if (calls === 2) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => fixture('layer.json') };
    };
    const latest = await sepa.fetchLatest(flaky);
    assert.equal(calls, 3);
    assert.equal(latest.length, 4);
  });

  test('does not retry a 4xx', async () => {
    let calls = 0;
    const bad = async () => { calls++; return { ok: false, status: 400, json: async () => ({}) }; };
    await assert.rejects(sepa.fetchLatest(bad), /HTTP 400/);
    assert.equal(calls, 1);
  });
});
