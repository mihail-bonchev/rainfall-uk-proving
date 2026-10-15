const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { dateRange, settledLookback, buildDailyRows, MIN_HOURS } = require('./sepa_daily');

const hoursOf = (date, mm, count = 24) =>
  Array.from({ length: count }, (_, i) => [Date.parse(`${date}T00:00:00Z`) + (i + 1) * 3600000, mm]);

describe('dateRange', () => {
  test('is inclusive and crosses month ends', () => {
    assert.deepEqual(dateRange('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
});

describe('settledLookback', () => {
  test('excludes today and yesterday until yesterday is 2 h settled', () => {
    assert.deepEqual(settledLookback(Date.parse('2026-10-15T01:00:00Z'), 2), ['2026-10-12', '2026-10-13']);
    assert.deepEqual(settledLookback(Date.parse('2026-10-15T03:00:00Z'), 2), ['2026-10-13', '2026-10-14']);
  });
});

describe('buildDailyRows', () => {
  test('a full day becomes one row; the hour ending at midnight belongs to the day before', () => {
    const hourly = new Map([['sepa:1', [...hoursOf('2026-10-14', 0.5), [Date.parse('2026-10-14T00:00:00Z'), 9]]]]);
    const rows = buildDailyRows(hourly, ['2026-10-14']);
    assert.deepEqual(rows, [{ station_ref: 'sepa:1', date: '2026-10-14', total_mm: 12, reading_count: 24 }]);
  });

  test(`gauges with fewer than ${MIN_HOURS} hourly values are left out, not recorded too low`, () => {
    const hourly = new Map([
      ['sepa:ok', hoursOf('2026-10-14', 1, MIN_HOURS)],
      ['sepa:gappy', hoursOf('2026-10-14', 1, MIN_HOURS - 1)],
    ]);
    assert.deepEqual(buildDailyRows(hourly, ['2026-10-14']).map((r) => r.station_ref), ['sepa:ok']);
  });

  test('only the requested dates are written', () => {
    const hourly = new Map([['sepa:1', [...hoursOf('2026-10-13', 1), ...hoursOf('2026-10-14', 1)]]]);
    assert.deepEqual(buildDailyRows(hourly, ['2026-10-14']).map((r) => r.date), ['2026-10-14']);
  });
});
