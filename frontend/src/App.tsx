import 'maplibre-gl/dist/maplibre-gl.css'
import Map from 'react-map-gl/maplibre'
import { useQuery } from '@tanstack/react-query'

function App() {
  useQuery({
    queryKey: ['ea-station-count'],
    queryFn: async () => {
      const res = await fetch(
        'https://environment.data.gov.uk/flood-monitoring/id/stations?parameter=rainfall&_count=1',
      )
      const data = await res.json()
      return data.meta?.totalCount ?? 0
    },
    staleTime: 300_000,
  })

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
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
      />
    </div>
  )
}

export default App
