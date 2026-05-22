const { parse } = require('csv-parse');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const UPSERT_BATCH_SIZE = 500;

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

        const measure = row.measure || '';
        const raw = row.value;
        const value = parseFloat(raw);

        // Step 1 — filter
        if (!raw || isNaN(value) || value < 0 || value > 500 || !measure.includes('-rainfall-')) {
          skippedRows++;
          return;
        }

        // Step 2 — extract stationRef
        const measureId = measure.split('/').pop();
        const idx = measureId.indexOf('-rainfall-');
        if (idx === -1) { skippedRows++; return; }
        const stationRef = measureId.slice(0, idx);

        // Step 3 — accumulate
        totals[stationRef] = (totals[stationRef] || 0) + value;
        counts[stationRef] = (counts[stationRef] || 0) + 1;
      });

      parser.on('end', () => resolve({ totals, counts, totalRows, skippedRows }));
      parser.on('error', reject);

      response.pipe(parser);
    }).on('error', reject);
  });
}

async function upsertRows(supabase, date, totals, counts) {
  const rows = Object.keys(totals).map((stationRef) => ({
    station_ref: stationRef,
    date,
    total_mm: Math.round(totals[stationRef] * 100) / 100,
    reading_count: counts[stationRef],
  }));

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('station_daily_totals')
      .upsert(batch, { onConflict: 'station_ref,date' });
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  return rows.length;
}

async function main() {
  const start = Date.now();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const date = getTargetDate();
  console.log(`Date:       ${date}`);
  console.log(`Downloading EA archive CSV...`);

  const { totals, counts, totalRows, skippedRows } = await downloadAndAggregate(date);
  const stationCount = Object.keys(totals).length;

  console.log(`Rows read:  ${totalRows}`);
  console.log(`Rows skipped: ${skippedRows}`);
  console.log(`Stations:   ${stationCount}`);
  console.log(`Upserting to Supabase...`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const upserted = await upsertRows(supabase, date, totals, counts);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done.       ${upserted} stations upserted in ${elapsed}s`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
