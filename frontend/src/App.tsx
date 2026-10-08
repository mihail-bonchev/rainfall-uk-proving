import { useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
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
import { RainfallSurface } from './components/RainfallSurface'
import { BasemapStyler } from './components/BasemapStyler'
import { BASEMAP_STYLE } from './utils/basemap'
import { getRainfallScale, type MapTheme } from './utils/rainfallScale'
import { Button } from './components/ui/button'
import { useLatestReadings, useRecentTotalsWarmup } from './hooks/useLatestReadings'
import { downloadRegionalCsv } from './utils/csvExport'
import type { TimeRange } from './types/api'

const DEFAULT_VIEW = { longitude: -1.8, latitude: 53.0, zoom: 5.6 }

function App() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const [showRegionalPanel, setShowRegionalPanel] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)
  const handleStationClick = useCallback((id: string) => setSelectedStationId(id), [])
  const [theme, setTheme] = useState<MapTheme>(() => {
    try {
      return localStorage.getItem('map-theme') === 'metoffice' ? 'metoffice' : 'bbc'
    } catch {
      return 'bbc'
    }
  })
  const viewRef = useRef(DEFAULT_VIEW)
  const [initialView, setInitialView] = useState(DEFAULT_VIEW)
  const toggleTheme = () => {
    const next = theme === 'bbc' ? 'metoffice' : 'bbc'
    setInitialView(viewRef.current)
    setTheme(next)
    try {
      localStorage.setItem('map-theme', next)
    } catch {
      // storage unavailable — theme just won't persist
    }
  }
  const scale = useMemo(() => getRainfallScale(timeRange, customRange), [timeRange, customRange])

  const {
    data: readingsMap = new Map<string, number>(),
    dataUpdatedAt,
    isError,
    failureCount,
    isFetching,
  } = useLatestReadings(timeRange, customRange)
  const pendingRanges = useRecentTotalsWarmup()

  return (
    <div data-testid="map-root" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {isFetching && (
        <div className="loading-bar-track">
          <div className="loading-bar-thumb" />
        </div>
      )}
      <StationDetailPanel
        stationId={selectedStationId}
        timeRange={timeRange}
        readingsMap={readingsMap}
        onClose={() => setSelectedStationId(null)}
        onViewAreaSummary={() => setShowRegionalPanel(true)}
      />
      <RegionalSummaryPanel
        open={showRegionalPanel}
        onClose={() => setShowRegionalPanel(false)}
        timeRange={timeRange}
        readingsMap={readingsMap}
        onDownloadCsv={(areas) => downloadRegionalCsv(areas, timeRange, customRange)}
      />
      <TimeRangeControl
        value={timeRange}
        onChange={setTimeRange}
        customRange={customRange}
        onCustomRange={setCustomRange}
        pending={pendingRanges}
      />
      <Button
        data-testid="regions-btn"
        variant="outline"
        size="sm"
        onClick={() => setShowRegionalPanel(true)}
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
        className="bg-slate-900/85 backdrop-blur-sm shadow-md text-slate-100 border-slate-700 hover:bg-slate-800/90"
      >
        Regions
      </Button>
      <Button
        data-testid="theme-btn"
        variant="outline"
        size="sm"
        onClick={toggleTheme}
        style={{ position: 'absolute', bottom: 32, right: 16, zIndex: 10 }}
        className="bg-slate-900/85 backdrop-blur-sm shadow-md text-slate-100 border-slate-700 hover:bg-slate-800/90"
      >
        Style: {theme === 'bbc' ? 'BBC' : 'Met Office'}
      </Button>
      <RainfallLegend scale={scale} theme={theme} />
      <SyncStatus dataUpdatedAt={dataUpdatedAt} isError={isError} />
      <OfflineBanner failureCount={failureCount} lastUpdatedAt={dataUpdatedAt} />
      {/* Remount on theme change so the new basemap and our layers load cleanly; view is kept. */}
      <MapGL
        key={theme}
        mapStyle={BASEMAP_STYLE[theme]}
        initialViewState={initialView}
        onMove={(e) => {
          const { longitude, latitude, zoom } = e.viewState
          viewRef.current = { longitude, latitude, zoom }
        }}
        style={{ position: 'absolute', inset: 0 }}
        minZoom={4.5}
        maxZoom={11}
        dragRotate={false}
        scrollZoom
        dragPan
        touchZoomRotate
      >
        <BasemapStyler theme={theme} />
        <RainfallSurface readingsMap={readingsMap} scale={scale} theme={theme} />
        <StationsSource onStationClick={handleStationClick} readingsMap={readingsMap} scale={scale} theme={theme} />
        <EAAreasSource readingsMap={readingsMap} />
      </MapGL>
    </div>
  )
}

export default App
