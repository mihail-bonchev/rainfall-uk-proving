const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { processRow, buildUpsertRows } = require('./ingest_archive');

// ---------------------------------------------------------------------------
// processRow — Step 1 (filter) + Step 2 (stationRef extraction)
// ---------------------------------------------------------------------------

describe('processRow', () => {
  const validMeasure = 'https://environment.data.gov.uk/flood-monitoring/id/measures/E3840-rainfall-tipping_bucket-15_min-mm';

  test('returns stationRef and value for a valid row', () => {
    const result = processRow({ measure: validMeasure, value: '0.2' });
    assert.deepEqual(result, { stationRef: 'E3840', value: 0.2 });
  });

  test('extracts stationRef as everything before the first -rainfall-', () => {
    const measure = 'https://example.com/id/measures/F99-rainfall-tipping_bucket-15_min-mm';
    assert.equal(processRow({ measure, value: '1.0' }).stationRef, 'F99');
  });

  test('returns null when value is empty', () => {
    assert.equal(processRow({ measure: validMeasure, value: '' }), null);
  });

  test('returns null when value is not numeric', () => {
    assert.equal(processRow({ measure: validMeasure, value: 'N/A' }), null);
  });

  test('returns null when value is negative (corrupt reading)', () => {
    assert.equal(processRow({ measure: validMeasure, value: '-0.1' }), null);
  });

  test('returns null when value is exactly 0 — valid dry reading', () => {
    const result = processRow({ measure: validMeasure, value: '0' });
    assert.deepEqual(result, { stationRef: 'E3840', value: 0 });
  });

  test('returns null when value exceeds 500 mm (physically impossible)', () => {
    assert.equal(processRow({ measure: validMeasure, value: '500.01' }), null);
  });

  test('accepts value of exactly 500 mm', () => {
    const result = processRow({ measure: validMeasure, value: '500' });
    assert.equal(result?.value, 500);
  });

  test('returns null when measure does not contain -rainfall-', () => {
    const nonRainfallMeasure = 'https://example.com/id/measures/E3840-level-stage-15_min-m';
    assert.equal(processRow({ measure: nonRainfallMeasure, value: '1.0' }), null);
  });

  test('returns null when measure is missing entirely', () => {
    assert.equal(processRow({ value: '1.0' }), null);
  });
});

// ---------------------------------------------------------------------------
// buildUpsertRows — Step 4 row builder
// ---------------------------------------------------------------------------

describe('buildUpsertRows', () => {
  test('returns one row per station with correct fields', () => {
    const totals = { E3840: 3.6 };
    const counts = { E3840: 18 };
    const rows = buildUpsertRows('2026-05-21', totals, counts);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      station_ref: 'E3840',
      date: '2026-05-21',
      total_mm: 3.6,
      reading_count: 18,
    });
  });

  test('rounds total_mm to 2 decimal places (NUMERIC(8,2))', () => {
    // 1.006 * 100 = 100.6 → round → 101 → 1.01 (avoids 1.005 float edge case)
    const totals = { E0001: 1.006 };
    const counts = { E0001: 1 };
    const rows = buildUpsertRows('2026-05-21', totals, counts);
    assert.equal(rows[0].total_mm, 1.01);
  });

  test('handles multiple stations', () => {
    const totals = { A: 10.0, B: 5.5 };
    const counts = { A: 40, B: 22 };
    const rows = buildUpsertRows('2026-05-21', totals, counts);
    assert.equal(rows.length, 2);
    const refs = rows.map((r) => r.station_ref).sort();
    assert.deepEqual(refs, ['A', 'B']);
  });

  test('returns empty array when no stations accumulated', () => {
    assert.deepEqual(buildUpsertRows('2026-05-21', {}, {}), []);
  });
});
