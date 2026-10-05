import { screen } from '@testing-library/react'
import App from './App'
import { renderWithProviders } from './test/utils'
import * as stationStore from './services/db/stationStore'

vi.mock('./services/db/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}))

const mockGetMap = vi.fn(() => ({
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  isStyleLoaded: () => false,
  getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
  getSource: vi.fn(),
  flyTo: vi.fn(),
}))

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="maplibre-stub" aria-label="Map">
      {children}
    </div>
  ),
  Source: ({ id }: { id: string }) => <div data-testid={`source-${id}`} />,
  Layer: () => null,
  Popup: () => null,
  useMap: () => ({ current: { getMap: mockGetMap } }),
}))

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the map root container', () => {
    renderWithProviders(<App />)
    expect(screen.getByTestId('map-root')).toBeInTheDocument()
  })

  it('renders the map stub (MapLibre mounted inside root)', () => {
    renderWithProviders(<App />)
    expect(screen.getByTestId('maplibre-stub')).toBeInTheDocument()
  })
})
