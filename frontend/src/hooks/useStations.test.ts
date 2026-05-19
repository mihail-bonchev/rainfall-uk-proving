import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useStations } from './useStations'
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

  it('returns a GeoJSON FeatureCollection from stations', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)

    const { result } = renderHook(() => useStations(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const fc = result.current.data!
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(2)
  })

  it('maps each station to a Point Feature with correct properties', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)

    const { result } = renderHook(() => useStations(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const f = result.current.data!.features[0]
    expect(f.type).toBe('Feature')
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [-0.1, 51.5] })
    expect(f.properties).toMatchObject({
      id: 'E0001',
      label: 'Station 1',
      eaAreaName: 'Thames',
      rainfall_mm: 0,
    })
  })

  it('coordinates are [longitude, latitude]', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue([MOCK_STATIONS[1]])

    const { result } = renderHook(() => useStations(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [lng, lat] = result.current.data!.features[0].geometry.coordinates as number[]
    expect(lng).toBe(MOCK_STATIONS[1].long)
    expect(lat).toBe(MOCK_STATIONS[1].lat)
  })
})
