const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { stationRefFromMeasure, accumulate, computeRecentTotals, sepaWindowTotals } = require('./recent_totals');

const measure = (ref) =>
  `http://environment.data.gov.uk/flood-monitoring/id/measures/${ref}-rainfall-tipping_bucket_raingauge-t-15_min-mm`;
const reading = (ref, iso, value) => ({ measure: measure(ref), dateTime: iso, value });
const NOW = Date.parse('2026-10-08T18:00:00Z');
const windowsFor = () => [6, 24].map((hours) => ({ hours, fromMs: NOW - hours * 3600000, totals: {} }));

describe('stationRefFromMeasure', () => {
  test('takes everything before -rainfall-', () => {
    assert.equal(stationRefFromMeasure(measure('E11820')), 'E11820');
  });
});

describe('accumulate', () => {
  test('a recent reading counts in both windows, an older one only in 24h', () => {
    const w = windowsFor();
    accumulate([reading('A', '2026-10-08T17:00:00Z', 1), reading('A', '2026-10-08T03:00:00Z', 2)], w, NOW);
    assert.deepEqual(w[0].totals, { A: 1 });
    assert.deepEqual(w[1].totals, { A: 3 });
  });

  test('ignores nulls, negatives, implausible spikes and future/out-of-window readings', () => {
    const w = windowsFor();
    accumulate(
      [
        reading('A', '2026-10-08T17:00:00Z', null),
        reading('A', '2026-10-08T17:15:00Z', -1),
        reading('A', '2026-10-08T17:30:00Z', 999),
        reading('A', '2026-10-08T18:15:00Z', 1),
        reading('A', '2026-10-07T18:00:00Z', 1),
      ],
      w,
      NOW,
    );
    assert.deepEqual(w[1].totals, {});
  });
});

describe('computeRecentTotals', () => {
  test('pages newest-first with _sorted and stops once past 24h ago', async () => {
    const urls = [];
    const fakeFetch = async (url) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get('_offset'));
      const iso = offset === 0 ? '2026-10-08T17:00:00Z' : offset === 10000 ? '2026-10-08T03:00:00Z' : '2026-10-07T12:00:00Z';
      return { ok: true, status: 200, json: async () => ({ items: new Array(10000).fill(reading('S1', iso, 0.01)) }) };
    };
    const { windows, pages } = await computeRecentTotals(NOW, fakeFetch);
    assert.ok(urls.every((u) => u.includes('_sorted')));
    assert.equal(pages, 4);
    assert.equal(windows.find((w) => w.hours === 6).totals.S1, 100);
    assert.equal(windows.find((w) => w.hours === 24).totals.S1, 200);
  });

  test('keeps paging past a page that comes back a few items short', async () => {
    const offsets = [];
    const fakeFetch = async (url) => {
      const offset = Number(new URL(url).searchParams.get('_offset'));
      offsets.push(offset);
      const short = offset === 10000;
      const iso = offset < 30000 ? '2026-10-08T10:00:00Z' : '2026-10-07T12:00:00Z';
      return { ok: true, status: 200, json: async () => ({ items: new Array(short ? 9998 : 10000).fill(reading('S1', iso, 0.01)) }) };
    };
    const { pages } = await computeRecentTotals(NOW, fakeFetch);
    assert.equal(pages, 4);
    assert.ok(offsets.includes(30000));
  });

  test('retries a 503 before succeeding', async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      return calls === 1 ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ items: [] }) };
    };
    const { windows } = await computeRecentTotals(NOW, flaky);
    assert.deepEqual(windows[0].totals, {});
    assert.ok(calls > 1);
  });
});

describe('sepaWindowTotals', () => {
  const now = Date.parse('2026-10-15T18:00:00Z');
  const hour = (iso, mm) => [Date.parse(iso), mm];
  const hourly = new Map([
    ['sepa:1', [hour('2026-10-15T18:00:00Z', 1), hour('2026-10-15T13:00:00Z', 2), hour('2026-10-15T12:00:00Z', 4), hour('2026-10-14T19:00:00Z', 8), hour('2026-10-14T18:00:00Z', 16)]],
    ['sepa:2', [hour('2026-10-14T20:00:00Z', 0.5)]],
    ['sepa:3', []],
  ]);
  const out = sepaWindowTotals(hourly, now);

  test('6h sums hours ending in (12:00, 18:00]; 24h sums hours ending in (yesterday 18:00, 18:00]', () => {
    assert.equal(out[6]['sepa:1'], 3);
    assert.equal(out[24]['sepa:1'], 15);
  });

  test('a gauge with no hour in a window is omitted from that window, not zero', () => {
    assert.equal('sepa:2' in out[6], false);
    assert.equal(out[24]['sepa:2'], 0.5);
    assert.equal('sepa:3' in out[24], false);
  });
});
