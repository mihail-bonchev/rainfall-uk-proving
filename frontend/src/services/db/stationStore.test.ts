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

  it('fetches from API and caches on first call', async () => {
    const spy = vi.spyOn(stationService, 'fetchAllStations').mockResolvedValue(MOCK_STATIONS)

    const result = await getStations()

    expect(spy).toHaveBeenCalledOnce()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('E0001')
  })

  it('serves from cache on subsequent call within 7 days', async () => {
    const spy = vi.spyOn(stationService, 'fetchAllStations').mockResolvedValue(MOCK_STATIONS)

    await getStations()
    const result = await getStations()

    expect(spy).toHaveBeenCalledOnce()
    expect(result).toHaveLength(2)
  })

  it('re-fetches after 7 days', async () => {
    const spy = vi.spyOn(stationService, 'fetchAllStations').mockResolvedValue(MOCK_STATIONS)

    // First call populates cache
    await getStations()

    // Travel 7+ days into the future
    const eightDays = 8 * 24 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + eightDays)

    await getStations()

    expect(spy).toHaveBeenCalledTimes(2)
  })
})
