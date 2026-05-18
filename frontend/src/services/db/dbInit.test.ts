import { getDb } from './dbInit'

// fake-indexeddb/auto patches globalThis.indexedDB before tests run (see setup.ts)

describe('getDb()', () => {
  it('returns a promise that resolves to an IDBPDatabase', async () => {
    const db = await getDb()
    expect(db).toBeDefined()
    expect(typeof db.transaction).toBe('function')
  })

  it('is a singleton — returns the same promise reference every call', () => {
    const p1 = getDb()
    const p2 = getDb()
    expect(p1).toBe(p2)
  })

  it('opens the database named rainfall-explorer', async () => {
    const db = await getDb()
    expect(db.name).toBe('rainfall-explorer')
  })

  it('creates all three object stores', async () => {
    const db = await getDb()
    expect(db.objectStoreNames.contains('stations')).toBe(true)
    expect(db.objectStoreNames.contains('readings')).toBe(true)
    expect(db.objectStoreNames.contains('syncMetadata')).toBe(true)
  })

  it('stations store has an eaAreaName index', async () => {
    const db = await getDb()
    const tx = db.transaction('stations', 'readonly')
    expect(tx.store.indexNames.contains('eaAreaName')).toBe(true)
  })

  it('stations store has a compound lat-long index', async () => {
    const db = await getDb()
    const tx = db.transaction('stations', 'readonly')
    expect(tx.store.indexNames.contains('lat-long')).toBe(true)
  })
})
