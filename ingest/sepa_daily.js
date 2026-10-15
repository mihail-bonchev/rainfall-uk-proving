// SEPA calendar-day totals → station_daily_totals (issues #85, #86).
//
// Day D = SEPA hourly totals ending in (D 00:00, D+1 00:00] UTC — the same
// midnight-to-midnight days as England (never SEPA's 09:00–09:00 HDay.Total).
// SEPA data is near real time, so day D is written once D+1 is a couple of hours
// old. A gauge needs MIN_HOURS hourly values for its day to count; otherwise it
// is left out (no data) rather than recorded as a too-low total.
//
//   node sepa_daily.js                              fill gaps in the last 7 days
//   node sepa_daily.js --from 2026-05-01 --to 2026-10-14   backfill (monthly chunks)

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const sepa = require('./providers/sepa');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const LOOKBACK_DAYS = 7;
const MIN_HOURS = 20;
const SETTLE_MS = 2 * 3600 * 1000; // wait until D+1 02:00 before writing day D
const UPSERT_BATCH = 500;
const CHUNK_DAYS = 31;

const DAY_MS = 24 * 3600 * 1000;
const dayStart = (date) => Date.parse(`${date}T00:00:00Z`);
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Dates from `from` to `to` inclusive (YYYY-MM-DD). */
function dateRange(from, to) {
  const out = [];
  for (let t = dayStart(from); t <= dayStart(to); t += DAY_MS) out.push(isoDate(t));
  return out;
}

/** The last `days` complete-and-settled dates before `nowMs`, oldest first. */
function settledLookback(nowMs, days = LOOKBACK_DAYS) {
  const lastSettled = isoDate(nowMs - SETTLE_MS - DAY_MS);
  return dateRange(isoDate(dayStart(lastSettled) - (days - 1) * DAY_MS), lastSettled);
}

/**
 * Rows for station_daily_totals from hourly points (Map<ref, [endMs, mm][]>),
 * restricted to `dates`; gauges with fewer than MIN_HOURS hourly values that day are skipped.
 */
function buildDailyRows(hourly, dates) {
  const wanted = new Set(dates);
  const rows = [];
  for (const [ref, points] of hourly) {
    for (const [date, { total, hours }] of sepa.dailyTotals(points)) {
      if (!wanted.has(date) || hours < MIN_HOURS) continue;
      rows.push({ station_ref: ref, date, total_mm: total, reading_count: hours });
    }
  }
  return rows;
}

async function missingDates(supabase, dates) {
  const missing = [];
  for (const date of dates) {
    const { count, error } = await supabase
      .from('station_daily_totals')
      .select('*', { count: 'exact', head: true })
      .eq('date', date)
      .like('station_ref', 'sepa:%');
    if (error) throw new Error(`Supabase count failed for ${date}: ${error.message}`);
    if (!count) missing.push(date);
  }
  return missing;
}

/** Fetches hourly totals covering `dates` (one KiWIS call per chunk) and upserts daily rows. */
async function ingestDates(supabase, dates, fetchImpl = fetch) {
  let written = 0;
  for (let i = 0; i < dates.length; i += CHUNK_DAYS) {
    const chunk = dates.slice(i, i + CHUNK_DAYS);
    // Hours ending in (first 00:00, last+1 00:00]; ask from first 00:00 so the boundary hour is included.
    const from = new Date(dayStart(chunk[0])).toISOString();
    const to = new Date(dayStart(chunk[chunk.length - 1]) + DAY_MS).toISOString();
    const rows = buildDailyRows(await sepa.fetchHourlyTotals(from, to, fetchImpl), chunk);
    for (let j = 0; j < rows.length; j += UPSERT_BATCH) {
      const { error } = await supabase
        .from('station_daily_totals')
        .upsert(rows.slice(j, j + UPSERT_BATCH), { onConflict: 'station_ref,date' });
      if (error) throw new Error(`Supabase upsert of SEPA daily totals failed: ${error.message}`);
    }
    written += rows.length;
  }
  return written;
}

function supabaseClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/** Cron step: fill any of the last 7 settled days with no SEPA rows. */
async function fillSepaDailyGaps({ nowMs = Date.now(), fetchImpl = fetch } = {}) {
  const supabase = supabaseClient();
  const dates = await missingDates(supabase, settledLookback(nowMs));
  if (dates.length === 0) return { dates, written: 0 };
  return { dates, written: await ingestDates(supabase, dates, fetchImpl) };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const get = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const [from, to] = [get('--from'), get('--to')];
  const t0 = Date.now();
  const job = from && to
    ? ingestDates(supabaseClient(), dateRange(from, to)).then((written) => ({ dates: dateRange(from, to), written }))
    : fillSepaDailyGaps();
  job
    .then(({ dates, written }) =>
      console.log(dates.length
        ? `✓ SEPA daily: ${written} station-days for ${dates[0]} → ${dates[dates.length - 1]} in ${((Date.now() - t0) / 1000).toFixed(1)}s`
        : '· SEPA daily: last 7 days already ingested'))
    .catch((err) => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}

module.exports = { dateRange, settledLookback, buildDailyRows, fillSepaDailyGaps, MIN_HOURS };
