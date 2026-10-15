// Refreshes the Supabase `stations` table (issue #78) — at most once a day.
//
// EA station records carry no area name, so each gauge is placed in an EA area
// by point-in-polygon against the same ea-areas.geojson the site serves. If the
// polygons can't be loaded the refresh is skipped, so existing rows keep their
// regions rather than being blanked.

const { createClient } = require('@supabase/supabase-js');
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

async function refreshStations({ force = false, fetchImpl = fetch, now = Date.now() } = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (!force && now - (await lastRefreshed(supabase, 'ea')) < REFRESH_EVERY_MS) {
    return { skipped: true };
  }

  const [stations, areas] = await Promise.all([
    fetchEaStations(fetchImpl),
    fetchJson(fetchImpl, EA_AREAS_URL).then(parseAreas),
  ]);
  if (areas.length === 0) throw new Error('EA areas GeoJSON has no polygons — refusing to blank regions');

  const updatedAt = new Date(now).toISOString();
  const rows = buildEaRows(stations, areas, updatedAt);
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const { error } = await supabase.from('stations').upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: 'station_ref' });
    if (error) throw new Error(`Supabase upsert to stations failed: ${error.message}`);
  }

  // Gauges the EA no longer lists were not touched by this run.
  const { error: delError, count } = await supabase
    .from('stations')
    .delete({ count: 'exact' })
    .eq('provider', 'ea')
    .lt('updated_at', updatedAt);
  if (delError) throw new Error(`Supabase delete of retired stations failed: ${delError.message}`);

  return { skipped: false, upserted: rows.length, withRegion: rows.filter((r) => r.region).length, removed: count || 0 };
}

if (require.main === module) {
  const t0 = Date.now();
  refreshStations({ force: process.argv.includes('--force') })
    .then((r) =>
      console.log(
        r.skipped
          ? '· stations refreshed < 24 h ago — skipped'
          : `✓ stations: ${r.upserted} EA (${r.withRegion} with region), ${r.removed} retired, in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      ),
    )
    .catch((err) => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchEaStations, parseAreas, assignArea, buildEaRows, refreshStations };
