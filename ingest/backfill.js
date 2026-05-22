const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { ingestArchive } = require('./ingest_archive');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const fromArg = get('--from');
  const toArg = get('--to');
  const daysArg = get('--days');

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const endDate = yesterday.toISOString().slice(0, 10);

  if (fromArg && toArg) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromArg) || !/^\d{4}-\d{2}-\d{2}$/.test(toArg)) {
      console.error('Invalid date format — expected YYYY-MM-DD for --from and --to');
      process.exit(1);
    }
    return { startDate: fromArg, endDate: toArg };
  }

  const days = daysArg ? parseInt(daysArg, 10) : 28;
  if (isNaN(days) || days < 1) {
    console.error(`Invalid --days value "${daysArg}" — must be a positive integer`);
    process.exit(1);
  }

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

function buildDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { startDate, endDate } = parseArgs();
  const dates = buildDateRange(startDate, endDate);

  console.log(`Backfilling ${dates.length} day(s): ${startDate} → ${endDate}`);

  for (const date of dates) {
    try {
      const { upserted } = await ingestArchive(date);
      console.log(`✓ ${date} — ${upserted} stations upserted`);
    } catch (err) {
      console.error(`✗ ${date} — ${err.message}`);
    }
    await sleep(1000);
  }

  console.log('Backfill complete.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
