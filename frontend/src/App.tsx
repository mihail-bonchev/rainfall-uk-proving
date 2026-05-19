import { useCallback, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import MapGL from 'react-map-gl/maplibre'
import { EAAreasSource } from './components/EAAreasSource'
import { StationsSource } from './components/StationsSource'
import { TimeRangeControl } from './components/TimeRangeControl'
import { SyncStatus } from './components/SyncStatus'
import { OfflineBanner } from './components/OfflineBanner'
import { useLatestReadings } from './hooks/useLatestReadings'
import type { TimeRange } from './types/api'

function App() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('15m')
  const handleStationClick = useCallback((id: string) => setSelectedStationId(id), [])

  const {
    data: readingsMap = new Map<string, number>(),
    dataUpdatedAt,
    isError,
    failureCount,
  } = useLatestReadings(timeRange)

  return (
    <div data-testid="map-root" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* selectedStationId will open the detail panel in Epic 5 */}
      {selectedStationId && (
        <div
          data-testid="selected-station"
          data-station-id={selectedStationId}
          style={{ display: 'none' }}
        />
      )}
      <TimeRangeControl value={timeRange} onChange={setTimeRange} />
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
        <EAAreasSource readingsMap={readingsMap} />
        <StationsSource onStationClick={handleStationClick} readingsMap={readingsMap} />
      </MapGL>
    </div>
  )
}

export default App
