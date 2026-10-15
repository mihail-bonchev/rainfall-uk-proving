// Railway cron entry point (every 15 minutes):
//  1. refresh 6h/24h per-station totals in Supabase `recent_totals`
//  2. fill any of the last 7 days missing from `station_daily_totals`
//     (cheap when nothing is missing; a day lands soon after EA publishes it)
//  3. fill any of the last 7 days missing SEPA (Scotland) daily totals
//  4. refresh the `stations` table per provider (EA, SEPA), each at most once per 24 h
// Each job runs even if the other fails; exits 1 if either failed so Railway alerts.

const { updateRecentTotals } = require('./recent_totals');
const { fillArchiveGaps } = require('./ingest_archive');
const { refreshStations, describeStationResults } = require('./stations');
const { fillSepaDailyGaps } = require('./sepa_daily');

async function run() {
  let failed = false;

  const t0 = Date.now();
  try {
    const { pages, counts, sepaCount, sepaError } = await updateRecentTotals();
    console.log(`✓ recent totals (${counts}; ${sepaCount} SEPA) from ${pages} EA pages in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (sepaError) {
      console.error(`✗ SEPA recent totals: ${sepaError} — kept previous Scottish values`);
      failed = true;
    }
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

  try {
    const { dates, written } = await fillSepaDailyGaps();
    console.log(dates.length ? `✓ SEPA daily: ${written} station-days for ${dates.join(', ')}` : '· SEPA daily: last 7 days already ingested');
  } catch (err) {
    console.error('✗ SEPA daily gap fill:', err.message);
    failed = true;
  }

  try {
    const { lines, failed: stationsFailed } = describeStationResults(await refreshStations());
    lines.forEach((l) => (l.startsWith('✗') ? console.error(l) : console.log(l)));
    if (stationsFailed) failed = true;
  } catch (err) {
    console.error('✗ stations refresh:', err.message);
    failed = true;
  }

  if (failed) process.exit(1);
}

run();
