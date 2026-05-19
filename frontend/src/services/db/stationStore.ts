import { getDb } from './dbInit'
import { fetchAllStations, type Station } from '../api/stationService'
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson'

export type { Station }

const CACHE_KEY = 'stationsLastFetched_v2'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function isCacheFresh(db: Awaited<ReturnType<typeof getDb>>): Promise<boolean> {
  const meta = await db.get('syncMetadata', CACHE_KEY)
  if (!meta) return false
  return Date.now() - (meta.value as number) < CACHE_TTL_MS
}

// Ray-casting point-in-polygon for a single ring.
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInGeometry(lon: number, lat: number, geometry: Polygon | MultiPolygon): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates
    return pointInRing(lon, lat, outer) && holes.every((h) => !pointInRing(lon, lat, h))
  }
  // MultiPolygon — any sub-polygon matches
  for (const poly of geometry.coordinates) {
    const [outer, ...holes] = poly
    if (pointInRing(lon, lat, outer) && holes.every((h) => !pointInRing(lon, lat, h))) return true
  }
  return false
}

interface AreaEntry {
  name: string
  geometry: Polygon | MultiPolygon
  bbox: [number, number, number, number] // [minLon, minLat, maxLon, maxLat]
}

function buildBbox(geometry: Polygon | MultiPolygon): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  const rings = geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.coordinates.flat()
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon
      if (lat < minLat) minLat = lat
      if (lon > maxLon) maxLon = lon
      if (lat > maxLat) maxLat = lat
    }
  }
  return [minLon, minLat, maxLon, maxLat]
}

async function loadAreaEntries(): Promise<AreaEntry[]> {
  const res = await fetch('/data/ea-areas.geojson')
  if (!res.ok) return []
  const geojson = (await res.json()) as FeatureCollection
  return geojson.features
    .filter((f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    .map((f) => {
      const geometry = f.geometry as Polygon | MultiPolygon
      return {
        name: (f.properties as { short_name: string }).short_name,
        geometry,
        bbox: buildBbox(geometry),
      }
    })
}

function assignArea(lon: number, lat: number, areas: AreaEntry[]): string {
  for (const area of areas) {
    const [minLon, minLat, maxLon, maxLat] = area.bbox
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue
    if (pointInGeometry(lon, lat, area.geometry)) return area.name
  }
  return ''
}

async function enrichWithAreaNames(stations: Station[]): Promise<Station[]> {
  const areas = await loadAreaEntries()
  if (areas.length === 0) return stations
  return stations.map((s) => ({
    ...s,
    eaAreaName: s.eaAreaName || assignArea(s.long, s.lat, areas),
  }))
}

export async function getStations(): Promise<Station[]> {
  const db = await getDb()

  if (await isCacheFresh(db)) {
    return db.getAll('stations')
  }

  const rawStations = await fetchAllStations()
  const stations = await enrichWithAreaNames(rawStations)

  const tx = db.transaction(['stations', 'syncMetadata'], 'readwrite')
  await tx.objectStore('stations').clear()
  for (const station of stations) {
    tx.objectStore('stations').put(station)
  }
  tx.objectStore('syncMetadata').put({ key: CACHE_KEY, value: Date.now() })
  await tx.done

  return stations
}
