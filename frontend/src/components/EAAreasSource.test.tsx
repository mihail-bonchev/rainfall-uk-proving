import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import type { FeatureCollection } from 'geojson'
import { EAAreasSource, computeAreaAverages } from './EAAreasSource'
import { renderWithProviders } from '../test/utils'
import * as stationStore from '../services/db/stationStore'

vi.mock('react-map-gl/maplibre', () => ({
  Source: ({ id, type, children }: { id: string; type: string; children?: React.ReactNode }) => (
    <div data-testid={`source-${id}`} data-source-type={type}>{children}</div>
  ),
  Layer: ({ id, type }: { id: string; type: string }) => (
    <div data-testid={`layer-${id}`} data-layer-type={type} />
  ),
}))

const MOCK_STATIONS = [
  { id: 'E0001', label: 'Station 1', lat: 51.5, long: -0.1, eaAreaName: 'Thames', gridReference: 'TQ1' },
  { id: 'E0002', label: 'Station 2', lat: 51.6, long: -0.2, eaAreaName: 'Thames', gridReference: 'TQ2' },
  { id: 'E0003', label: 'Station 3', lat: 52.0, long: -1.0, eaAreaName: 'East Midlands', gridReference: 'SK1' },
]

const MOCK_AREAS_GEOJSON: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }, properties: { short_name: 'Thames' } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]] }, properties: { short_name: 'East Midlands' } },
  ],
}

describe('computeAreaAverages', () => {
  it('returns empty map for empty FeatureCollection', () => {
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
    expect(computeAreaAverages(empty).size).toBe(0)
  })

  it('averages rainfall_mm per area', () => {
    const geoJSON: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { eaAreaName: 'Thames', rainfall_mm: 4 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { eaAreaName: 'Thames', rainfall_mm: 8 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { eaAreaName: 'East Midlands', rainfall_mm: 2 } },
      ],
    }
    const averages = computeAreaAverages(geoJSON)
    expect(averages.get('Thames')).toBe(6)
    expect(averages.get('East Midlands')).toBe(2)
  })

  it('treats missing rainfall_mm as 0', () => {
    const geoJSON: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { eaAreaName: 'Thames' } },
      ],
    }
    expect(computeAreaAverages(geoJSON).get('Thames')).toBe(0)
  })

  it('ignores features with no eaAreaName', () => {
    const geoJSON: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { rainfall_mm: 5 } },
      ],
    }
    expect(computeAreaAverages(geoJSON).size).toBe(0)
  })
})

describe('EAAreasSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing while areas GeoJSON is loading', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch

    const { container } = renderWithProviders(<EAAreasSource />)
    // Source is not rendered yet (areas query pending)
    expect(container.querySelector('[data-testid="source-ea-areas"]')).toBeNull()
  })

  it('renders the ea-areas GeoJSON source once data loads', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_AREAS_GEOJSON), { status: 200 })),
    ) as unknown as typeof fetch

    renderWithProviders(<EAAreasSource />)
    const source = await screen.findByTestId('source-ea-areas')
    expect(source).toBeInTheDocument()
    expect(source).toHaveAttribute('data-source-type', 'geojson')
  })

  it('renders a fill layer and an outline layer', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_AREAS_GEOJSON), { status: 200 })),
    ) as unknown as typeof fetch

    renderWithProviders(<EAAreasSource />)
    const fill = await screen.findByTestId('layer-ea-areas-fill')
    const outline = await screen.findByTestId('layer-ea-areas-outline')
    expect(fill).toHaveAttribute('data-layer-type', 'fill')
    expect(outline).toHaveAttribute('data-layer-type', 'line')
  })
})
