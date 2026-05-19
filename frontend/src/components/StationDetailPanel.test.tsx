import { screen, fireEvent, waitFor, render } from '@testing-library/react'
import { StationDetailPanel } from './StationDetailPanel'
import { renderWithProviders, makeWrapper } from '../test/utils'
import * as stationStore from '../services/db/stationStore'
import * as readingStore from '../services/db/readingStore'
import type { TimeRange } from '../types/api'

const MOCK_STATION = {
  id: 'ABC123',
  label: 'Thames at Teddington',
  eaAreaName: 'Thames',
  gridReference: 'TQ 1664 7086',
  lat: 51.4213,
  long: -0.3211,
}

function makeReading(value: number, minutesAgo: number) {
  const dateTime = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  return { stationRef: 'ABC123', value, dateTime }
}

const DEFAULT_TIME_RANGE: TimeRange = '24h'

describe('StationDetailPanel', () => {
  beforeEach(() => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue([MOCK_STATION])
    vi.spyOn(readingStore, 'getReadingsByStation').mockResolvedValue([])
  })

  afterEach(() => vi.restoreAllMocks())

  it('renders nothing visible when stationId is null', () => {
    renderWithProviders(<StationDetailPanel stationId={null} timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.queryByTestId('station-detail-panel')).not.toBeInTheDocument()
  })

  it('opens the sheet when stationId is provided', () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.getByTestId('station-detail-panel')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('uses side="right" on desktop', () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.getByTestId('station-detail-panel')).toHaveAttribute('data-side', 'right')
  })

  it('uses side="bottom" on mobile', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.getByTestId('station-detail-panel')).toHaveAttribute('data-side', 'bottom')
  })

  // --- Header (5.2) ---

  it('shows station label as the panel title', async () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('panel-station-name')).toHaveTextContent('Thames at Teddington'),
    )
  })

  it('shows EA area name', async () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('panel-area')).toHaveTextContent('Thames'),
    )
  })

  it('shows grid reference when available', async () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('panel-grid-ref')).toHaveTextContent('TQ 1664 7086'),
    )
  })

  it('hides grid reference when empty', async () => {
    vi.spyOn(stationStore, 'getStations').mockResolvedValue([{ ...MOCK_STATION, gridReference: '' }])
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('panel-station-name')).toHaveTextContent('Thames at Teddington'),
    )
    expect(screen.queryByTestId('panel-grid-ref')).not.toBeInTheDocument()
  })

  it('shows coordinates formatted to 4 decimal places', async () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('panel-coords')).toHaveTextContent('51.4213° N, 0.3211° W'),
    )
  })

  // --- Current reading (5.3) ---

  it('shows "No recent data" when no reading in last 24h', async () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('no-recent-data')).toBeInTheDocument(),
    )
  })

  it('shows reading value with 1 decimal place', async () => {
    vi.spyOn(readingStore, 'getReadingsByStation').mockResolvedValue([makeReading(12.4, 8)])
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('reading-badge')).toHaveTextContent('12.4 mm'),
    )
  })

  it('shows data age in minutes', async () => {
    vi.spyOn(readingStore, 'getReadingsByStation').mockResolvedValue([makeReading(5.0, 8)])
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('reading-meta')).toHaveTextContent('8 min ago'),
    )
  })

  it('shows data age in hours and minutes when over 60 min', async () => {
    vi.spyOn(readingStore, 'getReadingsByStation').mockResolvedValue([makeReading(5.0, 150)])
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('reading-meta')).toHaveTextContent('2 h 30 min ago'),
    )
  })

  it('shows reading timestamp in HH:mm format', async () => {
    vi.spyOn(readingStore, 'getReadingsByStation').mockResolvedValue([makeReading(3.0, 0)])
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    await waitFor(() => {
      const meta = screen.getByTestId('reading-meta')
      expect(meta.textContent).toMatch(/at \d{2}:\d{2}/)
    })
  })

  // --- View area summary button (5.6) ---

  it('shows "View [Area] summary" button when onViewAreaSummary is provided', async () => {
    renderWithProviders(
      <StationDetailPanel
        stationId="ABC123"
        timeRange={DEFAULT_TIME_RANGE}
        onClose={vi.fn()}
        onViewAreaSummary={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('view-area-summary-btn')).toHaveTextContent('View Thames summary'),
    )
  })

  it('calls onViewAreaSummary with the area name when clicked', async () => {
    const onViewAreaSummary = vi.fn()
    renderWithProviders(
      <StationDetailPanel
        stationId="ABC123"
        timeRange={DEFAULT_TIME_RANGE}
        onClose={vi.fn()}
        onViewAreaSummary={onViewAreaSummary}
      />,
    )
    await waitFor(() => screen.getByTestId('view-area-summary-btn'))
    screen.getByTestId('view-area-summary-btn').click()
    expect(onViewAreaSummary).toHaveBeenCalledWith('Thames')
  })

  it('does not render the area summary button when onViewAreaSummary is not provided', async () => {
    renderWithProviders(
      <StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />,
    )
    await waitFor(() => screen.getByTestId('panel-station-name'))
    expect(screen.queryByTestId('view-area-summary-btn')).not.toBeInTheDocument()
  })

  // --- EA external link (5.5) ---

  it('renders the EA website link with correct href', () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    const link = screen.getByTestId('ea-link')
    expect(link).toHaveAttribute(
      'href',
      'https://environment.data.gov.uk/flood-monitoring/id/stations/ABC123',
    )
  })

  it('opens the EA link in a new tab', () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.getByTestId('ea-link')).toHaveAttribute('target', '_blank')
  })

  it('has noopener noreferrer on the EA link', () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.getByTestId('ea-link')).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('has accessible aria-label on the EA link', () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.getByTestId('ea-link')).toHaveAttribute('aria-label', 'View this station on the EA website')
  })

  // --- Chart (5.4) ---

  it('renders the chart section container', () => {
    renderWithProviders(<StationDetailPanel stationId="ABC123" timeRange={DEFAULT_TIME_RANGE} onClose={vi.fn()} />)
    expect(screen.getByTestId('chart-section')).toBeInTheDocument()
  })

  it('re-fetches chart data when timeRange changes', async () => {
    const spy = vi.spyOn(readingStore, 'getReadingsByStation').mockResolvedValue([])
    const Wrapper = makeWrapper()
    const { rerender } = render(
      <StationDetailPanel stationId="ABC123" timeRange="24h" onClose={vi.fn()} />,
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(spy).toHaveBeenCalled())
    spy.mockClear()
    rerender(
      <StationDetailPanel stationId="ABC123" timeRange="7d" onClose={vi.fn()} />,
    )
    await waitFor(() => expect(spy).toHaveBeenCalled())
  })
})
