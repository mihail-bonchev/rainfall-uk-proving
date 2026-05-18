import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import App from './App'
import { renderWithProviders } from './test/utils'
import { server } from './test/msw/server'

// MapLibre requires WebGL which jsdom doesn't provide — replace with a stub
vi.mock('react-map-gl/maplibre', () => ({
  default: () => <div data-testid="maplibre-stub" aria-label="Map" />,
}))

describe('App', () => {
  it('renders the map root container', () => {
    renderWithProviders(<App />)
    expect(screen.getByTestId('map-root')).toBeInTheDocument()
  })

  it('renders the map stub (MapLibre mounted inside root)', () => {
    renderWithProviders(<App />)
    expect(screen.getByTestId('maplibre-stub')).toBeInTheDocument()
  })

  it('fires the EA station-count smoke query on mount', async () => {
    let requested = false
    server.use(
      http.get(
        'https://environment.data.gov.uk/flood-monitoring/id/stations',
        () => {
          requested = true
          return HttpResponse.json({ meta: { totalCount: 1027 }, items: [] })
        },
      ),
    )

    renderWithProviders(<App />)

    await waitFor(() => expect(requested).toBe(true), { timeout: 3000 })
  })

  it('continues to render map when the EA API returns an error', async () => {
    server.use(
      http.get(
        'https://environment.data.gov.uk/flood-monitoring/id/stations',
        () => HttpResponse.error(),
      ),
    )

    renderWithProviders(<App />)

    // Map root must still be visible — TanStack Query handles the error internally
    await waitFor(() =>
      expect(screen.getByTestId('map-root')).toBeInTheDocument(),
    )
  })
})
