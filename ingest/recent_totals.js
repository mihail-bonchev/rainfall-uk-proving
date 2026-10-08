// Pre-computes per-station rainfall totals for the last 6h and 24h into the
// Supabase `recent_totals` table so the frontend can read them instantly.
//
// The EA bulk /data/readings endpoint caps at 10,000 readings per call and
// rejects `since=`, but with `_sorted` it returns newest-first across all
// stations — so one pass back to 24h ago yields both windows.
// Same approach as frontend/api/rainfall-totals.ts (the frontend's fallback).

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const EA_READINGS = 'https://environment.data.gov.uk/flood-monitoring/data/readings';
const PAGE_SIZE = 10000;
const PARALLEL_PAGES = 2;
const MAX_PAGES = 16;
const RETRIES = 3;
// A 15-minute tipping-bucket reading above this is a gauge fault, not rain.
const MAX_PLAUSIBLE_15MIN_MM = 50;
const WINDOWS_HOURS = [6, 24];

function stationRefFromMeasure(measure) {
  const id = measure.split('/').pop() || '';
  const idx = id.indexOf('-rainfall-');
  return idx > 0 ? id.slice(0, idx) : '';
}

/** Adds each reading to every window (fromMs, nowMs] it falls in. */
function accumulate(items, windows, nowMs) {
  for (const r of items) {
    if (r.value == null || r.value < 0 || r.value > MAX_PLAUSIBLE_15MIN_MM) continue;
    const t = Date.parse(r.dateTime);
    if (!(t <= nowMs)) continue;
    const ref = stationRefFromMeasure(r.measure);
    if (!ref) continue;
    for (const w of windows) {
      if (t > w.fromMs) w.totals[ref] = (w.totals[ref] || 0) + r.value;
    }
  }
}

async function fetchPage(fetchImpl, from, to, offset) {
  const url = `${EA_READINGS}?parameter=rainfall&_sorted&startdate=${from}&enddate=${to}&_limit=${PAGE_SIZE}&_offset=${offset}`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      // Dropped connections ("fetch failed") are transient on the EA API.
      if (attempt >= RETRIES) throw new Error(`EA API unreachable at offset ${offset}: ${err.message}`, { cause: err });
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    if (res.ok) return (await res.json()).items || [];
    if (res.status < 500 || attempt >= RETRIES) throw new Error(`EA API ${res.status} at offset ${offset}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

async function computeRecentTotals(nowMs, fetchImpl = fetch) {
  const windows = WINDOWS_HOURS.map((hours) => ({ hours, fromMs: nowMs - hours * 3600000, totals: {} }));
  const oldestMs = Math.min(...windows.map((w) => w.fromMs));
  const from = new Date(oldestMs).toISOString().slice(0, 10);
  const to = new Date(nowMs).toISOString().slice(0, 10);

  let pages = 0;
  for (let first = 0; first < MAX_PAGES; first += PARALLEL_PAGES) {
    const batch = await Promise.all(
      Array.from({ length: PARALLEL_PAGES }, (_, i) => fetchPage(fetchImpl, from, to, (first + i) * PAGE_SIZE)),
    );
    pages += batch.length;
    batch.forEach((items) => accumulate(items, windows, nowMs));
    const last = batch[batch.length - 1];
    // Only an empty page means the end: EA pages can come back a few items short.
    const reachedEnd = batch.some((p) => p.length === 0);
    const passedWindow = last.length > 0 && Date.parse(last[last.length - 1].dateTime) <= oldestMs;
    if (reachedEnd || passedWindow) break;
  }

  for (const w of windows) {
    for (const ref of Object.keys(w.totals)) w.totals[ref] = Math.round(w.totals[ref] * 100) / 100;
  }
  return { windows, pages };
}

async function updateRecentTotals() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');

  const nowMs = Date.now();
  const { windows, pages } = await computeRecentTotals(nowMs);
  const computedAt = new Date(nowMs).toISOString();
  const rows = windows.map((w) => ({
    hours: w.hours,
    computed_at: computedAt,
    station_count: Object.keys(w.totals).length,
    totals: w.totals,
  }));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error } = await supabase.from('recent_totals').upsert(rows, { onConflict: 'hours' });
  if (error) throw new Error(`Supabase upsert to recent_totals failed: ${error.message}`);

  return { pages, counts: rows.map((r) => `${r.hours}h=${r.station_count}`).join(', ') };
}

if (require.main === module) {
  const t0 = Date.now();
  updateRecentTotals()
    .then(({ pages, counts }) => console.log(`✓ recent totals (${counts}) from ${pages} EA pages in ${((Date.now() - t0) / 1000).toFixed(1)}s`))
    .catch((err) => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}

module.exports = { stationRefFromMeasure, accumulate, computeRecentTotals, updateRecentTotals };
