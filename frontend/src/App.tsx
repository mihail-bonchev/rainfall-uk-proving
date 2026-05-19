import { useCallback, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import MapGL from 'react-map-gl/maplibre'
import type { DateRange } from 'react-day-picker'
import { EAAreasSource } from './components/EAAreasSource'
import { StationsSource } from './components/StationsSource'
import { StationDetailPanel } from './components/StationDetailPanel'
import { RegionalSummaryPanel } from './components/RegionalSummaryPanel'
import { TimeRangeControl } from './components/TimeRangeControl'
import { SyncStatus } from './components/SyncStatus'
import { OfflineBanner } from './components/OfflineBanner'
import { RainfallLegend } from './components/RainfallLegend'
import { Button } from './components/ui/button'
import { useLatestReadings } from './hooks/useLatestReadings'
import { downloadRegionalCsv } from './utils/csvExport'
import type { TimeRange } from './types/api'

function App() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const [showRegionalPanel, setShowRegionalPanel] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>('15m')
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  const handleStationClick = useCallback((id: string) => setSelectedStationId(id), [])

  const {
    data: readingsMap = new Map<string, number>(),
    dataUpdatedAt,
    isError,
    failureCount,
  } = useLatestReadings(timeRange, customRange)

  return (
    <div data-testid="map-root" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <StationDetailPanel
        stationId={selectedStationId}
        timeRange={timeRange}
        onClose={() => setSelectedStationId(null)}
        onViewAreaSummary={() => setShowRegionalPanel(true)}
      />
      <RegionalSummaryPanel
        open={showRegionalPanel}
        onClose={() => setShowRegionalPanel(false)}
        timeRange={timeRange}
        customRange={customRange}
        onDownloadCsv={(areas) => downloadRegionalCsv(areas, timeRange, customRange)}
      />
      <TimeRangeControl
        value={timeRange}
        onChange={setTimeRange}
        customRange={customRange}
        onCustomRange={setCustomRange}
      />
      <Button
        data-testid="regions-btn"
        variant="outline"
        size="sm"
        onClick={() => setShowRegionalPanel(true)}
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
        className="bg-white/90 backdrop-blur-sm shadow-md"
      >
        Regions
      </Button>
      <RainfallLegend timeRange={timeRange} />
      <SyncStatus dataUpdatedAt={dataUpdatedAt} isError={isError} />
      <OfflineBanner failureCount={failureCount} lastUpdatedAt={dataUpdatedAt} />
      <MapGL
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        initialViewState={{
          longitude: -2.5,
          latitude: 54.0,
          zoom: 6,
        }}
        style={{ position: 'absolute', inset: 0 }}
        scrollZoom
        dragPan
        touchZoomRotate
      >
        <EAAreasSource readingsMap={readingsMap} timeRange={timeRange} customRange={customRange} />
        <StationsSource onStationClick={handleStationClick} readingsMap={readingsMap} />
      </MapGL>
    </div>
  )
}

export default App
