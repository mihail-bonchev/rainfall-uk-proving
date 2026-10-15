// Refreshes the Supabase `stations` table (issue #78) — at most once a day.
//
// EA station records carry no area name, so each gauge is placed in an EA area
// by point-in-polygon against the same ea-areas.geojson the site serves. If the
// polygons can't be loaded the refresh is skipped, so existing rows keep their
// regions rather than being blanked.

const { createClient } = require('@supabase/supabase-js');
const sepa = require('./providers/sepa');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const EA_STATIONS = 'https://environment.data.gov.uk/flood-monitoring/id/stations?parameter=rainfall';
const EA_AREAS_URL = process.env.EA_AREAS_URL || 'https://rain.xelantis.com/data/ea-areas.geojson';
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const REFRESH_EVERY_MS = 24 * 3600 * 1000;
const UPSERT_BATCH = 500;

async function fetchJson(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Pages until a page adds no new stations (the EA API no longer reports totalCount). */
async function fetchEaStations(fetchImpl = fetch) {
  const byRef = new Map();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items = [] } = await fetchJson(fetchImpl, `${EA_STATIONS}&_limit=${PAGE_SIZE}&_offset=${page * PAGE_SIZE}`);
    const before = byRef.size;
    for (const s of items) {
      if (typeof s.lat !== 'number' || typeof s.long !== 'number' || !s.stationReference) continue;
      byRef.set(s.stationReference, s);
    }
    if (items.length === 0 || byRef.size === before) break;
  }
  return [...byRef.values()];
}

function bbox(rings) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, polygon) {
  const [outer, ...holes] = polygon;
  return pointInRing(lon, lat, outer) && holes.every((h) => !pointInRing(lon, lat, h));
}

/** [{ name, polygons, bbox }] from the EA areas GeoJSON (`short_name` = eaAreaName). */
function parseAreas(geojson) {
  return geojson.features
    .filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f) => {
      const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      return { name: f.properties.short_name, polygons, bbox: bbox(polygons.flat()) };
    });
}

function assignArea(lon, lat, areas) {
  for (const a of areas) {
    const [minLon, minLat, maxLon, maxLat] = a.bbox;
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
    if (a.polygons.some((p) => pointInPolygon(lon, lat, p))) return a.name;
  }
  return null;
}

// The EA areas cover England, so an EA gauge outside all of them is one of the
// few the EA runs over the border (upper Severn/Wye catchments) — i.e. in Wales.
function buildEaRows(stations, areas, updatedAt) {
  return stations.map((s) => {
    const region = assignArea(s.long, s.lat, areas);
    return {
      station_ref: s.stationReference,
      provider: 'ea',
      nation: region ? 'England' : 'Wales',
      region,
      label: s.label || s.stationReference,
      lat: s.lat,
      long: s.long,
      grid_ref: s.gridReference || null,
      updated_at: updatedAt,
    };
  });
}

async function lastRefreshed(supabase, provider) {
  const { data, error } = await supabase
    .from('stations')
    .select('updated_at')
    .eq('provider', provider)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Supabase read of stations failed: ${error.message}`);
  return data.length ? Date.parse(data[0].updated_at) : 0;
}

const SEPA_SILENT_AFTER_MS = 7 * 24 * 3600 * 1000;

/** SEPA gauges that reported within the last 7 days; others are left out. */
function buildSepaRows(stations, latest, updatedAt, now) {
  const fresh = new Set(latest.filter((x) => now - Date.parse(x.time) < SEPA_SILENT_AFTER_MS).map((x) => x.ref));
  return stations
    .filter((s) => fresh.has(s.ref))
    .map((s) => ({
      station_ref: s.ref,
      provider: 'sepa',
      nation: 'Scotland',
      region: 'Scotland',
      label: s.label,
      lat: s.lat,
      long: s.long,
      grid_ref: null,
      updated_at: updatedAt,
    }));
}

const PROVIDERS = {
  async ea({ fetchImpl, updatedAt }) {
    const [stations, areas] = await Promise.all([
      fetchEaStations(fetchImpl),
      fetchJson(fetchImpl, EA_AREAS_URL).then(parseAreas),
    ]);
    if (areas.length === 0) throw new Error('EA areas GeoJSON has no polygons — refusing to blank regions');
    return buildEaRows(stations, areas, updatedAt);
  },
  async sepa({ fetchImpl, updatedAt, now }) {
    const [stations, latest] = await Promise.all([sepa.fetchStations(fetchImpl), sepa.fetchLatest(fetchImpl)]);
    return buildSepaRows(stations, latest, updatedAt, now);
  },
};

async function writeProvider(supabase, provider, rows, updatedAt) {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const { error } = await supabase.from('stations').upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: 'station_ref' });
    if (error) throw new Error(`Supabase upsert to stations failed: ${error.message}`);
  }
  // Gauges this provider no longer lists were not touched by this run.
  const { error, count } = await supabase
    .from('stations')
    .delete({ count: 'exact' })
    .eq('provider', provider)
    .lt('updated_at', updatedAt);
  if (error) throw new Error(`Supabase delete of retired stations failed: ${error.message}`);
  return count || 0;
}

/**
 * Refreshes each provider independently (each at most once per 24 h unless forced).
 * Returns { [provider]: { skipped } | { upserted, withRegion, removed } | { error } }.
 */
async function refreshStations({ force = false, fetchImpl = fetch, now = Date.now(), providers = Object.keys(PROVIDERS) } = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const updatedAt = new Date(now).toISOString();

  const results = {};
  for (const provider of providers) {
    try {
      if (!force && now - (await lastRefreshed(supabase, provider)) < REFRESH_EVERY_MS) {
        results[provider] = { skipped: true };
        continue;
      }
      const rows = await PROVIDERS[provider]({ fetchImpl, updatedAt, now });
      // An empty list is a broken upstream, not "all gauges retired" — don't wipe the table.
      if (rows.length === 0) throw new Error('provider returned no stations');
      const removed = await writeProvider(supabase, provider, rows, updatedAt);
      results[provider] = { upserted: rows.length, withRegion: rows.filter((r) => r.region).length, removed };
    } catch (err) {
      results[provider] = { error: err.message };
    }
  }
  return results;
}

/** One log line per provider, and whether any provider failed. */
function describeStationResults(results) {
  const lines = Object.entries(results).map(([p, r]) => {
    if (r.error) return `✗ stations ${p}: ${r.error}`;
    if (r.skipped) return `· stations ${p}: refreshed < 24 h ago — skipped`;
    return `✓ stations ${p}: ${r.upserted} (${r.withRegion} with region), ${r.removed} retired`;
  });
  return { lines, failed: Object.values(results).some((r) => r.error) };
}

if (require.main === module) {
  refreshStations({ force: process.argv.includes('--force') })
    .then((results) => {
      const { lines, failed } = describeStationResults(results);
      lines.forEach((l) => console.log(l));
      if (failed) process.exit(1);
    })
    .catch((err) => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchEaStations, parseAreas, assignArea, buildEaRows, buildSepaRows, refreshStations, describeStationResults };
