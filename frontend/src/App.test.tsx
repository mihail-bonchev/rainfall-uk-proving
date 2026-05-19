import { screen } from '@testing-library/react'
import App from './App'
import { renderWithProviders } from './test/utils'
import * as stationStore from './services/db/stationStore'

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="maplibre-stub" aria-label="Map">
      {children}
    </div>
  ),
  Source: ({ id }: { id: string }) => <div data-testid={`source-${id}`} />,
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
