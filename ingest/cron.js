// Railway cron entry point (every 15 minutes):
//  1. refresh 6h/24h per-station totals in Supabase `recent_totals`
//  2. fill any of the last 7 days missing from `station_daily_totals`
//     (cheap when nothing is missing; a day lands soon after EA publishes it)
// Each job runs even if the other fails; exits 1 if either failed so Railway alerts.

const { updateRecentTotals } = require('./recent_totals');
const { fillArchiveGaps } = require('./ingest_archive');

async function run() {
  let failed = false;

  const t0 = Date.now();
  try {
    const { pages, counts } = await updateRecentTotals();
    console.log(`✓ recent totals (${counts}) from ${pages} EA pages in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error('✗ recent totals:', err.message);
    failed = true;
  }

  try {
    await fillArchiveGaps();
  } catch (err) {
    console.error('✗ archive gap fill:', err.message);
    failed = true;
  }

  if (failed) process.exit(1);
}

run();
