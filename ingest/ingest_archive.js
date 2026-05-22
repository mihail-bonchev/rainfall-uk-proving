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

function getTargetDate() {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf('--date');
  if (flagIdx !== -1 && args[flagIdx + 1]) {
    const d = args[flagIdx + 1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error(`Invalid date format "${d}" — expected YYYY-MM-DD`);
      process.exit(1);
    }
    return d;
  }
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

function downloadAndAggregate(date) {
  const url = `https://environment.data.gov.uk/flood-monitoring/archive/readings-${date}.csv`;

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`EA archive returned HTTP ${response.statusCode} for ${date}`));
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
  const start = Date.now();

  const date = getTargetDate();
  console.log(`Date:       ${date}`);
  console.log(`Downloading EA archive CSV...`);

  const { upserted, totalRows, skippedRows, stationCount } = await ingestArchive(date);

  console.log(`Rows read:  ${totalRows}`);
  console.log(`Rows skipped: ${skippedRows}`);
  console.log(`Stations:   ${stationCount}`);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done.       ${upserted} stations upserted in ${elapsed}s`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { processRow, buildUpsertRows, ingestArchive };
