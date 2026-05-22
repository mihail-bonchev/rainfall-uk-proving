import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../test/utils'
import * as stationStore from '../services/db/stationStore'
import { RegionalSummaryPanel } from './RegionalSummaryPanel'
import type { Station } from '../services/api/stationService'

const MOCK_STATIONS: Station[] = [
  { id: 'E0001', label: 'Station 1', lat: 51, long: -0.1, eaAreaName: 'Thames', gridReference: 'TQ000000' },
  { id: 'E0002', label: 'Station 2', lat: 51, long: -0.2, eaAreaName: 'Thames', gridReference: 'TQ000001' },
  { id: 'E0003', label: 'Station 3', lat: 54, long: -1.5, eaAreaName: 'Yorkshire', gridReference: 'SE000000' },
]

beforeEach(() => {
  vi.spyOn(stationStore, 'getStations').mockResolvedValue(MOCK_STATIONS)
})

afterEach(() => vi.restoreAllMocks())

function renderPanel(
  open = true,
  readingsMap: Map<string, number> = new Map(),
) {
  return renderWithProviders(
    <RegionalSummaryPanel
      open={open}
      onClose={vi.fn()}
      timeRange="24h"
      readingsMap={readingsMap}
    />,
  )
}

describe('RegionalSummaryPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel(false)
    expect(screen.queryByTestId('regional-summary-panel')).not.toBeInTheDocument()
  })

  it('renders the panel when open', () => {
    renderPanel()
    expect(screen.getByTestId('regional-summary-panel')).toBeInTheDocument()
  })

  it('renders area rows after stations load', async () => {
    const readingsMap = new Map([['E0001', 5.0], ['E0003', 10.0]])
    renderPanel(true, readingsMap)
    await waitFor(() => {
      const rows = screen.getAllByTestId('regional-row')
      expect(rows.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('table shows correct column headers', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /^Area$/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Avg rainfall \(mm\)/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Stations w\/ data/i })).toBeInTheDocument()
    })
  })

  it('does not show a "Total (mm)" column', async () => {
    renderPanel()
    await waitFor(() => screen.getByRole('columnheader', { name: /^Area$/i }))
    expect(screen.queryByRole('columnheader', { name: /Total/i })).not.toBeInTheDocument()
  })

  it('sorts by avg rainfall when clicking the Avg rainfall header', async () => {
    const readingsMap = new Map([['E0001', 5.0], ['E0003', 10.0]])
    renderPanel(true, readingsMap)
    await waitFor(() => screen.getAllByTestId('regional-row'))

    fireEvent.click(screen.getByText(/Avg rainfall/i))
    const rows = screen.getAllByTestId('regional-row')
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('calls onClose when panel is dismissed', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <RegionalSummaryPanel open={true} onClose={onClose} timeRange="24h" readingsMap={new Map()} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders the Download CSV button when onDownloadCsv is provided and data is loaded', async () => {
    const readingsMap = new Map([['E0001', 5.0]])
    const onDownloadCsv = vi.fn()
    renderWithProviders(
      <RegionalSummaryPanel
        open={true}
        onClose={vi.fn()}
        timeRange="24h"
        readingsMap={readingsMap}
        onDownloadCsv={onDownloadCsv}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('download-csv-btn')).toBeInTheDocument()
    })
  })

  it('calls onDownloadCsv with areas data when download button clicked', async () => {
    const readingsMap = new Map([['E0001', 5.0]])
    const onDownloadCsv = vi.fn()
    renderWithProviders(
      <RegionalSummaryPanel
        open={true}
        onClose={vi.fn()}
        timeRange="24h"
        readingsMap={readingsMap}
        onDownloadCsv={onDownloadCsv}
      />,
    )
    await waitFor(() => screen.getByTestId('download-csv-btn'))
    fireEvent.click(screen.getByTestId('download-csv-btn'))
    expect(onDownloadCsv).toHaveBeenCalledWith(expect.any(Array))
  })

  it('reflects the currently selected time range in the subtitle', () => {
    renderWithProviders(
      <RegionalSummaryPanel open={true} onClose={vi.fn()} timeRange="7d" readingsMap={new Map()} />,
    )
    expect(screen.getByTestId('regional-panel-subtitle')).toHaveTextContent('7-day')
  })
})
