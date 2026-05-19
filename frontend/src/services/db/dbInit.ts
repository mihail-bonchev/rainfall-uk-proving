import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Station } from '../api/stationService'

interface Reading {
  stationRef: string
  dateTime: string
  value: number
  measure: string
  fetched_at: string
}

interface SyncMetadata {
  key: string
  value: unknown
}

interface RainfallDB extends DBSchema {
  stations: {
    key: string
    value: Station
    indexes: {
      eaAreaName: string
      'lat-long': [number, number]
    }
  }
  readings: {
    key: [string, string]
    value: Reading
  }
  syncMetadata: {
    key: string
    value: SyncMetadata
  }
}

let dbPromise: Promise<IDBPDatabase<RainfallDB>> | null = null

export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('rainfall-explorer')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

export function getDb(): Promise<IDBPDatabase<RainfallDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RainfallDB>('rainfall-explorer', 1, {
      upgrade(db) {
        const stationStore = db.createObjectStore('stations', { keyPath: 'id' })
        stationStore.createIndex('eaAreaName', 'eaAreaName')
        stationStore.createIndex('lat-long', ['lat', 'long'])

        db.createObjectStore('readings', { keyPath: ['stationRef', 'dateTime'] })

        db.createObjectStore('syncMetadata', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}
