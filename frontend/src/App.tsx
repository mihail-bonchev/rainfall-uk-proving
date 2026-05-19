import { useCallback, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import Map from 'react-map-gl/maplibre'
import { EAAreasSource } from './components/EAAreasSource'
import { StationsSource } from './components/StationsSource'

function App() {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const handleStationClick = useCallback((id: string) => setSelectedStationId(id), [])

  return (
    <div data-testid="map-root" style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      {/* selectedStationId will open the detail panel in Epic 5 */}
      {selectedStationId && <div data-testid="selected-station" data-station-id={selectedStationId} style={{ display: 'none' }} />}
      <Map
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
        <EAAreasSource />
        <StationsSource onStationClick={handleStationClick} />
      </Map>
    </div>
  )
}

export default App
