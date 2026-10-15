import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getStations } from './stationStore'
import { _resetDbForTests } from './dbInit'
import * as stationService from '../api/stationService'

const MOCK_STATIONS: stationService.Station[] = [
  { id: 'E0001', label: 'Station 1', lat: 51.5, long: -0.1, eaAreaName: 'Thames', gridReference: 'TQ1' },
  { id: 'E0002', label: 'Station 2', lat: 52.0, long: -1.0, eaAreaName: 'East Midlands', gridReference: 'SK2' },
]

describe('getStations', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await _resetDbForTests()
  })

  it('loads from Supabase and caches on first call, without touching the EA API', async () => {
    const supabaseSpy = vi.spyOn(stationService, 'fetchStationsFromSupabase').mockResolvedValue(MOCK_STATIONS)
    const eaSpy = vi.spyOn(stationService, 'fetchAllStations').mockResolvedValue([])

    const result = await getStations()

    expect(supabaseSpy).toHaveBeenCalledOnce()
    expect(eaSpy).not.toHaveBeenCalled()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('E0001')
  })

  it('falls back to the EA API when Supabase fails', async () => {
    vi.spyOn(stationService, 'fetchStationsFromSupabase').mockRejectedValue(new Error('down'))
    const eaSpy = vi.spyOn(stationService, 'fetchAllStations').mockResolvedValue(MOCK_STATIONS)

    const result = await getStations()

    expect(eaSpy).toHaveBeenCalledOnce()
    expect(result.map((s) => s.id)).toEqual(['E0001', 'E0002'])
    expect(result[0].nation).toBe('England')
  })

  it('serves from cache on a subsequent call within a day', async () => {
    const spy = vi.spyOn(stationService, 'fetchStationsFromSupabase').mockResolvedValue(MOCK_STATIONS)

    await getStations()
    const result = await getStations()

    expect(spy).toHaveBeenCalledOnce()
    expect(result).toHaveLength(2)
  })

  it('re-fetches after a day', async () => {
    const spy = vi.spyOn(stationService, 'fetchStationsFromSupabase').mockResolvedValue(MOCK_STATIONS)

    // First call populates cache
    await getStations()

    // Travel just over a day into the future
    const overADay = 25 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + overADay)

    await getStations()

    expect(spy).toHaveBeenCalledTimes(2)
  })
})
