const { parse } = require('csv-parse');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const UPSERT_BATCH_SIZE = 500;

/**
 * Steps 1 + 2 — validate one CSV row and extract its stationRef.
 * Returns { stationRef, value } if the row is valid, or null to skip it.
 */
function processRow(row) {
  const measure = row.measure || '';
  const raw = row.value;
  const value = parseFloat(raw);

  if (!raw || isNaN(value) || value < 0 || value > 500 || !measure.includes('-rainfall-')) {
    return null;
  }

  const measureId = measure.split('/').pop();
  const idx = measureId.indexOf('-rainfall-');
  if (idx === -1) return null;

  return { stationRef: measureId.slice(0, idx), value };
}

/**
 * Step 4 helper — convert accumulated totals/counts into upsert rows.
 * Rounds total_mm to 2 decimal places to match NUMERIC(8,2).
 */
function buildUpsertRows(date, totals, counts) {
  return Object.keys(totals).map((stationRef) => ({
    station_ref: stationRef,
    date,
    total_mm: Math.round(totals[stationRef] * 100) / 100,
    reading_count: counts[stationRef],
  }));
}

// EA publishes each day's archive ~22:20 UTC the following day, so the most
// recent file is often 2 days old. Each run fills any gaps in a lookback window.
const LOOKBACK_DAYS = 7;

function parseDateArg() {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf('--date');
  if (flagIdx === -1 || !args[flagIdx + 1]) return null;
  const d = args[flagIdx + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error(`Invalid date format "${d}" — expected YYYY-MM-DD`);
    process.exit(1);
  }
  return d;
}

function lookbackDates(days, now = new Date()) {
  const dates = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function findMissingDates(supabase, dates) {
  const missing = [];
  for (const date of dates) {
    const { count, error } = await supabase
      .from('station_daily_totals')
      .select('*', { count: 'exact', head: true })
      .eq('date', date);
    if (error) throw new Error(`Supabase count failed for ${date}: ${error.message}`);
    if (!count) missing.push(date);
  }
  return missing;
}

function downloadAndAggregate(date) {
  const url = `https://environment.data.gov.uk/flood-monitoring/archive/readings-full-${date}.csv`;

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        const err = new Error(`EA archive returned HTTP ${response.statusCode} for ${date}`);
        err.statusCode = response.statusCode;
        reject(err);
        return;
      }

      const totals = {};
      const counts = {};
      let totalRows = 0;
      let skippedRows = 0;

      const parser = parse({ columns: true, skip_empty_lines: true, relax_column_count: true });

      parser.on('data', (row) => {
        totalRows++;
        const parsed = processRow(row);
        if (!parsed) { skippedRows++; return; }
        totals[parsed.stationRef] = (totals[parsed.stationRef] || 0) + parsed.value;
        counts[parsed.stationRef] = (counts[parsed.stationRef] || 0) + 1;
      });

      parser.on('end', () => resolve({ totals, counts, totalRows, skippedRows }));
      parser.on('error', reject);

      response.pipe(parser);
    }).on('error', reject);
  });
}

async function upsertRows(supabase, date, totals, counts) {
  const rows = buildUpsertRows(date, totals, counts);

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('station_daily_totals')
      .upsert(batch, { onConflict: 'station_ref,date' });
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  return rows.length;
}

async function ingestArchive(date) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  const { totals, counts, totalRows, skippedRows } = await downloadAndAggregate(date);
  const stationCount = Object.keys(totals).length;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const upserted = await upsertRows(supabase, date, totals, counts);
  return { upserted, totalRows, skippedRows, stationCount };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }
  const start = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const explicit = parseDateArg();
  const dates = explicit
    ? [explicit]
    : await findMissingDates(supabase, lookbackDates(LOOKBACK_DAYS));

  if (dates.length === 0) {
    console.log(`Nothing to do — last ${LOOKBACK_DAYS} days already ingested.`);
    return;
  }
  console.log(`Dates to ingest: ${dates.join(', ')}`);

  for (const date of dates) {
    try {
      const { upserted, totalRows, skippedRows } = await ingestArchive(date);
      console.log(`✓ ${date} — ${upserted} stations upserted (${totalRows} rows read, ${skippedRows} skipped)`);
    } catch (err) {
      if (err.statusCode === 404 && !explicit) {
        console.log(`· ${date} — not published by EA yet, will retry next run`);
        continue;
      }
      throw err;
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { processRow, buildUpsertRows, ingestArchive, lookbackDates, fillArchiveGaps: main };
