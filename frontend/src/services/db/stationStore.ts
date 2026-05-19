import { getDb } from './dbInit'
import { fetchAllStations, type Station } from '../api/stationService'

export type { Station }

const CACHE_KEY = 'stationsLastFetched'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function isCacheFresh(db: Awaited<ReturnType<typeof getDb>>): Promise<boolean> {
  const meta = await db.get('syncMetadata', CACHE_KEY)
  if (!meta) return false
  return Date.now() - (meta.value as number) < CACHE_TTL_MS
}

export async function getStations(): Promise<Station[]> {
  const db = await getDb()

  if (await isCacheFresh(db)) {
    return db.getAll('stations')
  }

  const stations = await fetchAllStations()

  const tx = db.transaction(['stations', 'syncMetadata'], 'readwrite')
  await tx.objectStore('stations').clear()
  for (const station of stations) {
    tx.objectStore('stations').put(station)
  }
  tx.objectStore('syncMetadata').put({ key: CACHE_KEY, value: Date.now() })
  await tx.done

  return stations
}
