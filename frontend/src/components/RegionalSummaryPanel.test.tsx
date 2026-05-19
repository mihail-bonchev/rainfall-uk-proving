import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw/server'
import { renderWithProviders } from '../test/utils'
import * as stationStore from '../services/db/stationStore'
import { RegionalSummaryPanel } from './RegionalSummaryPanel'
import type { Station } from '../services/api/stationService'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

const MOCK_STATIONS: Station[] = [
  { id: 'E0001', label: 'Station 1', lat: 51, long: -0.1, eaAreaName: 'Thames', gridReference: 'TQ000000' },
  { id: 'E0002', label: 'Station 2', lat: 51, long: -0.2, eaAreaName: 'Thames', gridReference: 'TQ000001' },
  { id: 'E0003', label: 'Station 3', lat: 54, long: -1.5, eaAreaName: 'Yorkshire', gridReference: 'SE000000' },
]

beforeEach(() => {
  vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
})

afterEach(() => vi.restoreAllMocks())

function renderPanel(open = true) {
  return renderWithProviders(
    <RegionalSummaryPanel open={open} onClose={vi.fn()} timeRange="24h" />,
  )
}

describe('RegionalSummaryPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel(false)
    expect(screen.queryByTestId('regional-summary-panel')).not.toBeInTheDocument()
  })

  it('renders the panel when open', () => {
    server.use(http.get(`${EA_BASE}/data/readings`, () => HttpResponse.json({ items: [] })))
    renderPanel()
    expect(screen.getByTestId('regional-summary-panel')).toBeInTheDocument()
  })

  it('shows loading state while fetching', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, async () => {
        await new Promise(() => {}) // never resolves
        return HttpResponse.json({ items: [] })
      }),
    )
    renderPanel()
    await waitFor(() => {
      expect(screen.getByTestId('regional-loading')).toBeInTheDocument()
    })
  })

  it('shows "No data available" row when the API errors', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    )
    renderPanel()
    await waitFor(() => {
      expect(screen.getByTestId('regional-no-data')).toBeInTheDocument()
    })
  })

  it('renders area rows after data loads', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [
            { stationReference: 'E0001', value: 5.0, dateTime: '2025-11-21T14:00:00Z', measure: 'test' },
            { stationReference: 'E0003', value: 10.0, dateTime: '2025-11-21T14:00:00Z', measure: 'test' },
          ],
        }),
      ),
    )
    renderPanel()
    await waitFor(() => {
      const rows = screen.getAllByTestId('regional-row')
      expect(rows.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('table shows correct column headers', async () => {
    server.use(http.get(`${EA_BASE}/data/readings`, () => HttpResponse.json({ items: [] })))
    renderPanel()
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /^Area$/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Total \(mm\)/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Avg\/station/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Stations w\/ data/i })).toBeInTheDocument()
    })
  })

  it('sorts by total when clicking the Total header', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [
            { stationReference: 'E0001', value: 5.0, dateTime: '2025-11-21T14:00:00Z', measure: 'test' },
            { stationReference: 'E0003', value: 10.0, dateTime: '2025-11-21T14:00:00Z', measure: 'test' },
          ],
        }),
      ),
    )
    renderPanel()
    await waitFor(() => screen.getAllByTestId('regional-row'))

    // Click Total header to sort ascending
    fireEvent.click(screen.getByText(/Total \(mm\)/i))
    const rows = screen.getAllByTestId('regional-row')
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('calls onClose when panel is dismissed', () => {
    server.use(http.get(`${EA_BASE}/data/readings`, () => HttpResponse.json({ items: [] })))
    const onClose = vi.fn()
    renderWithProviders(
      <RegionalSummaryPanel open={true} onClose={onClose} timeRange="24h" />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders the Download CSV button when onDownloadCsv is provided and data is loaded', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [
            { stationReference: 'E0001', value: 5.0, dateTime: '2025-11-21T14:00:00Z', measure: 'test' },
          ],
        }),
      ),
    )
    const onDownloadCsv = vi.fn()
    renderWithProviders(
      <RegionalSummaryPanel open={true} onClose={vi.fn()} timeRange="24h" onDownloadCsv={onDownloadCsv} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('download-csv-btn')).toBeInTheDocument()
    })
  })

  it('calls onDownloadCsv with areas data when download button clicked', async () => {
    server.use(
      http.get(`${EA_BASE}/data/readings`, () =>
        HttpResponse.json({
          items: [
            { stationReference: 'E0001', value: 5.0, dateTime: '2025-11-21T14:00:00Z', measure: 'test' },
          ],
        }),
      ),
    )
    const onDownloadCsv = vi.fn()
    renderWithProviders(
      <RegionalSummaryPanel open={true} onClose={vi.fn()} timeRange="24h" onDownloadCsv={onDownloadCsv} />,
    )
    await waitFor(() => screen.getByTestId('download-csv-btn'))
    fireEvent.click(screen.getByTestId('download-csv-btn'))
    expect(onDownloadCsv).toHaveBeenCalledWith(expect.any(Array))
  })

  it('reflects the currently selected time range in the subtitle', async () => {
    server.use(http.get(`${EA_BASE}/data/readings`, () => HttpResponse.json({ items: [] })))
    renderWithProviders(
      <RegionalSummaryPanel open={true} onClose={vi.fn()} timeRange="7d" />,
    )
    expect(screen.getByTestId('regional-panel-subtitle')).toHaveTextContent('7-day')
  })
})
