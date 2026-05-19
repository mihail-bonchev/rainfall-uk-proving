import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { StationsSource } from './StationsSource'
import { renderWithProviders } from '../test/utils'
import * as stationStore from '../services/db/stationStore'

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, type, data, children }: { id: string; type: string; data: object; children?: React.ReactNode }) => (
    <div
      data-testid={`source-${id}`}
      data-source-type={type}
      data-feature-count={String((data as { features?: unknown[] }).features?.length ?? 0)}
    >
      {children}
    </div>
  ),
  Layer: ({ id, type }: { id: string; type: string }) => (
    <div data-testid={`layer-${id}`} data-layer-type={type} />
  ),
}))

const MOCK_STATIONS = [
  { id: 'E0001', label: 'Station 1', lat: 51.5, long: -0.1, eaAreaName: 'Thames', gridReference: 'TQ1' },
  { id: 'E0002', label: 'Station 2', lat: 52.0, long: -1.0, eaAreaName: 'East Midlands', gridReference: 'SK2' },
]

describe('StationsSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing while data is loading', () => {
    vi.spyOn(stationStore, 'getStations').mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(<StationsSource />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a geojson source named "stations" once data loads', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)

    const { findByTestId } = renderWithProviders(<StationsSource />)

    const el = await findByTestId('source-stations')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('data-source-type', 'geojson')
  })

  it('passes all stations as features to the source', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)

    renderWithProviders(<StationsSource />)

    const el = await screen.findByTestId('source-stations')
    expect(el).toHaveAttribute('data-feature-count', '2')
  })

  it('renders a circle layer for station points', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)

    renderWithProviders(<StationsSource />)

    const layer = await screen.findByTestId('layer-station-circles')
    expect(layer).toBeInTheDocument()
    expect(layer).toHaveAttribute('data-layer-type', 'circle')
  })
})
