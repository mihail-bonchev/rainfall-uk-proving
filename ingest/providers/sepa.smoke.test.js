// Live contract check against SEPA KiWIS — run with `npm run test:smoke` (not part of `npm test`).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const sepa = require('./sepa');

describe('SEPA KiWIS contract (live)', { timeout: 60000 }, () => {
  test('station list: ~300 rain gauges with Scottish coordinates', async () => {
    const stations = await sepa.fetchStations();
    assert.ok(stations.length > 200, `only ${stations.length} gauges`);
    assert.ok(stations.every((s) => s.lat > 54.5 && s.lat < 61 && s.long > -8.5 && s.long < -0.5));
  });

  test('value layer: most gauges reported in the last 24 h', async () => {
    const latest = await sepa.fetchLatest();
    const fresh = latest.filter((x) => Date.now() - Date.parse(x.time) < 24 * 3600 * 1000);
    assert.ok(fresh.length > 200, `only ${fresh.length} fresh`);
  });

  test('hourly totals: one call returns ~24 points per gauge for the last day', async () => {
    const to = new Date(); to.setUTCMinutes(0, 0, 0);
    const from = new Date(to.getTime() - 24 * 3600 * 1000);
    const hourly = await sepa.fetchHourlyTotals(from.toISOString(), to.toISOString());
    const full = [...hourly.values()].filter((p) => p.length >= 23);
    assert.ok(full.length > 200, `only ${full.length} gauges with a full day`);
  });
});
