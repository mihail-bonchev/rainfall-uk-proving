import { getDb } from './dbInit'
import type { Reading } from '../../types/api'

export async function upsertReadings(readings: Reading[]): Promise<void> {
  if (readings.length === 0) return
  const db = await getDb()
  const tx = db.transaction('readings', 'readwrite')
  const store = tx.objectStore('readings')
  for (const r of readings) {
    store.put({
      stationRef: r.stationRef,
      dateTime: r.dateTime,
      value: r.value,
      measure: r.measure ?? '',
      fetched_at: new Date().toISOString(),
    })
  }
  await tx.done
}

export async function getReadingsByStation(
  stationRef: string,
  from: Date,
  to: Date,
): Promise<Reading[]> {
  const db = await getDb()
  const range = IDBKeyRange.bound(
    [stationRef, from.toISOString()],
    [stationRef, to.toISOString()],
  )
  const results = await db.getAll('readings', range)
  return results.map((r) => ({ stationRef: r.stationRef, value: r.value, dateTime: r.dateTime }))
}

export async function getReadingsSince(since: Date): Promise<Reading[]> {
  const db = await getDb()
  const tx = db.transaction('readings', 'readonly')
  const index = tx.store.index('dateTime')
  const range = IDBKeyRange.lowerBound(since.toISOString())
  const results = await index.getAll(range)
  return results.map((r) => ({ stationRef: r.stationRef, value: r.value, dateTime: r.dateTime }))
}
