// SEPA (Scotland) rainfall via the KiWIS time-series API — issue #82.
//
// Verified Oct 2026: no key, OGL, CORS `*`. The legacy www2.sepa.org.uk rainfall
// API is retired. Every call below covers all ~300 gauges at once.
//
// Timestamps mark the END of each interval (an Hour.Total stamped 23:00 covers
// 22:00–23:00), matching the EA's 15-min readings. `HDay.Total` is a 09:00–09:00
// hydrological day, so calendar days are built from Hour.Total instead.

const KIWIS = 'https://timeseries.sepa.org.uk/KiWIS/KiWIS?service=kisters&type=queryServices&datasource=0&format=json';
const RETRIES = 3;

const sepaRef = (stationNo) => `sepa:${stationNo}`;

async function kiwis(fetchImpl, params) {
  const url = `${KIWIS}&${params}`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      if (attempt >= RETRIES) throw new Error(`SEPA KiWIS unreachable: ${err.message}`, { cause: err });
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status < 500 || attempt >= RETRIES) throw new Error(`SEPA KiWIS HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

/** Rain gauges with coordinates: [{ ref, stationNo, label, lat, long }]. */
async function fetchStations(fetchImpl = fetch) {
  const table = await kiwis(
    fetchImpl,
    'request=getTimeseriesList&ts_path=1/*/RE/15m.Total&returnfields=station_no,station_name,station_latitude,station_longitude',
  );
  const [header, ...rows] = table;
  const col = (name) => header.indexOf(name);
  const byNo = new Map();
  for (const r of rows) {
    const lat = parseFloat(r[col('station_latitude')]);
    const long = parseFloat(r[col('station_longitude')]);
    const stationNo = r[col('station_no')];
    if (!stationNo || !Number.isFinite(lat) || !Number.isFinite(long)) continue;
    byNo.set(stationNo, { ref: sepaRef(stationNo), stationNo, label: r[col('station_name')] || stationNo, lat, long });
  }
  return [...byNo.values()];
}

/** Latest 15-min total per gauge: [{ ref, time, value }] (gauges with no value skipped). */
async function fetchLatest(fetchImpl = fetch) {
  const layer = await kiwis(
    fetchImpl,
    'request=getTimeseriesValueLayer&ts_path=1/*/RE/15m.Total&metadata=true&md_returnfields=station_no',
  );
  return layer
    .filter((x) => x.station_no && x.timestamp && typeof x.ts_value === 'number' && x.ts_value >= 0)
    .map((x) => ({ ref: sepaRef(x.station_no), time: x.timestamp, value: x.ts_value }));
}

/**
 * Hourly totals for every gauge, for hours ending in [fromIso, toIso]:
 * Map<ref, Array<[endTimeMs, mm]>>. Null/negative values are dropped.
 */
async function fetchHourlyTotals(fromIso, toIso, fetchImpl = fetch) {
  const series = await kiwis(
    fetchImpl,
    `request=getTimeseriesValues&ts_path=1/*/RE/Hour.Total&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}` +
      '&returnfields=Timestamp,Value&metadata=true&md_returnfields=station_no',
  );
  const out = new Map();
  for (const s of series) {
    if (!s.station_no) continue;
    const points = (s.data || [])
      .filter(([, v]) => typeof v === 'number' && v >= 0)
      .map(([t, v]) => [Date.parse(t), v]);
    out.set(sepaRef(s.station_no), points);
  }
  return out;
}

/** Sum of hourly totals whose hour ends in (fromMs, toMs]. */
function sumWindow(points, fromMs, toMs) {
  let total = 0;
  for (const [t, v] of points) if (t > fromMs && t <= toMs) total += v;
  return Math.round(total * 100) / 100;
}

/**
 * Calendar-day (UTC) totals from hourly points: hours ending in (D 00:00, D+1 00:00].
 * Returns Map<'YYYY-MM-DD', { total, hours }>; only days with all 24 hours are complete.
 */
function dailyTotals(points) {
  const days = new Map();
  for (const [t, v] of points) {
    const day = new Date(t - 1).toISOString().slice(0, 10); // an hour ending at 00:00 belongs to the day before
    const d = days.get(day) || { total: 0, hours: 0 };
    d.total += v;
    d.hours += 1;
    days.set(day, d);
  }
  for (const d of days.values()) d.total = Math.round(d.total * 100) / 100;
  return days;
}

module.exports = { sepaRef, fetchStations, fetchLatest, fetchHourlyTotals, sumWindow, dailyTotals };
