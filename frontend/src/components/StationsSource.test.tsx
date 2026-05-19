import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { StationsSource } from './StationsSource'
import { renderWithProviders } from '../test/utils'
import * as stationStore from '../services/db/stationStore'

const mockOn = vi.fn()
const mockOff = vi.fn()
const mockGetCanvas = vi.fn(() => ({ style: { cursor: '' } }))
const mockGetSource = vi.fn()
const mockFlyTo = vi.fn()
const mockGetMap = vi.fn(() => ({
  on: mockOn,
  off: mockOff,
  getCanvas: mockGetCanvas,
  getSource: mockGetSource,
  flyTo: mockFlyTo,
}))

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({
    id,
    type,
    data,
    cluster,
    children,
  }: {
    id: string
    type: string
    data: object
    cluster?: boolean
    children?: React.ReactNode
  }) => (
    <div
      data-testid={`source-${id}`}
      data-source-type={type}
      data-clustered={String(cluster ?? false)}
      data-feature-count={String((data as { features?: unknown[] }).features?.length ?? 0)}
    >
      {children}
    </div>
  ),
  Layer: ({ id, type }: { id: string; type: string }) => (
    <div data-testid={`layer-${id}`} data-layer-type={type} />
  ),
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="station-tooltip">{children}</div>
  ),
  useMap: () => ({ current: { getMap: mockGetMap } }),
}))

const MOCK_STATIONS = [
  { id: 'E0001', label: 'Station 1', lat: 51.5, long: -0.1, eaAreaName: 'Thames', gridReference: 'TQ1' },
  { id: 'E0002', label: 'Station 2', lat: 52.0, long: -1.0, eaAreaName: 'East Midlands', gridReference: 'SK2' },
]

describe('StationsSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockOn.mockReset()
    mockOff.mockReset()
  })

  it('renders nothing while data is loading', () => {
    vi.spyOn(stationStore, 'getStations').mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(<StationsSource />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a clustered geojson source named "stations"', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)

    renderWithProviders(<StationsSource />)
    const el = await screen.findByTestId('source-stations')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute('data-source-type', 'geojson')
    expect(el).toHaveAttribute('data-clustered', 'true')
  })

  it('passes all stations as features to the source', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)

    renderWithProviders(<StationsSource />)
    const el = await screen.findByTestId('source-stations')
    expect(el).toHaveAttribute('data-feature-count', '2')
  })

  it('renders all three cluster circle layers', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    renderWithProviders(<StationsSource />)
    const large = await screen.findByTestId('layer-clusters-large')
    const medium = await screen.findByTestId('layer-clusters-medium')
    const small = await screen.findByTestId('layer-clusters-small')
    expect(large).toHaveAttribute('data-layer-type', 'circle')
    expect(medium).toHaveAttribute('data-layer-type', 'circle')
    expect(small).toHaveAttribute('data-layer-type', 'circle')
  })

  it('renders a cluster-count symbol layer', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    renderWithProviders(<StationsSource />)
    const label = await screen.findByTestId('layer-cluster-count')
    expect(label).toHaveAttribute('data-layer-type', 'symbol')
  })

  it('renders the station-circles circle layer for individual stations', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    renderWithProviders(<StationsSource />)
    const layer = await screen.findByTestId('layer-station-circles')
    expect(layer).toHaveAttribute('data-layer-type', 'circle')
  })

  it('registers click and hover event handlers on the map', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    renderWithProviders(<StationsSource />)
    await screen.findByTestId('source-stations')
    // Each cluster layer: click + mouseenter + mouseleave = 3 × 3 = 9
    // station-circles: click + mouseenter + mouseleave = 3
    // Total: 12 on() calls
    expect(mockOn).toHaveBeenCalledWith('click', 'clusters-large', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('click', 'clusters-medium', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('click', 'clusters-small', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('click', 'station-circles', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('mouseenter', 'station-circles', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('mouseleave', 'station-circles', expect.any(Function))
  })
})
