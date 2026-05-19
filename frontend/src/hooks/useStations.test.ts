import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useStations, toGeoJSON } from './useStations'
import * as stationStore from '../services/db/stationStore'

const MOCK_STATIONS = [
  { id: 'E0001', label: 'Station 1', lat: 51.5, long: -0.1, eaAreaName: 'Thames', gridReference: 'TQ1' },
  { id: 'E0002', label: 'Station 2', lat: 52.0, long: -1.0, eaAreaName: 'East Midlands', gridReference: 'SK2' },
]

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

describe('useStations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an array of Station objects', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    const { result } = renderHook(() => useStations(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data![0]).toMatchObject({ id: 'E0001', label: 'Station 1' })
  })

  it('is pending while data is loading', () => {
    vi.spyOn(stationStore, 'getStations').mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useStations(), { wrapper: makeWrapper() })
    expect(result.current.isPending).toBe(true)
  })
})

describe('toGeoJSON', () => {
  it('returns a GeoJSON FeatureCollection from stations', () => {
    const fc = toGeoJSON(MOCK_STATIONS)
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(2)
  })

  it('maps each station to a Point Feature with correct properties', () => {
    const fc = toGeoJSON(MOCK_STATIONS)
    const f = fc.features[0]
    expect(f.type).toBe('Feature')
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [-0.1, 51.5] })
    expect(f.properties).toMatchObject({
      id: 'E0001',
      label: 'Station 1',
      eaAreaName: 'Thames',
      rainfall_mm: 0,
    })
  })

  it('uses readingsMap values for rainfall_mm', () => {
    const readingsMap = new Map([['E0001', 3.7]])
    const fc = toGeoJSON(MOCK_STATIONS, readingsMap)
    expect(fc.features[0].properties!.rainfall_mm).toBeCloseTo(3.7)
    expect(fc.features[1].properties!.rainfall_mm).toBe(0)
  })

  it('coordinates are [longitude, latitude]', () => {
    const fc = toGeoJSON([MOCK_STATIONS[1]])
    const [lng, lat] = (fc.features[0].geometry as import('geojson').Point).coordinates as number[]
    expect(lng).toBe(MOCK_STATIONS[1].long)
    expect(lat).toBe(MOCK_STATIONS[1].lat)
  })
})
