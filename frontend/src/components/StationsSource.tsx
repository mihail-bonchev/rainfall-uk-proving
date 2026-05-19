import { Source, Layer, type LayerProps } from 'react-map-gl/maplibre'
import { useStations } from '../hooks/useStations'

// Met Office rainfall colour scale — step expression on rainfall_mm property
const RAINFALL_COLOUR_SCALE = [
  'step',
  ['get', 'rainfall_mm'],
  'transparent', // < 0.1 mm
  0.1, '#a8d5f5', // pale blue
  0.5, '#50c8f4', // cyan
  2,   '#00a651', // green
  5,   '#fff200', // yellow
  10,  '#ff7f00', // orange
  20,  '#e8001d', // red
  50,  '#9b0026', // dark red/purple
] as LayerProps['paint'][string]

const stationCircleLayer: LayerProps = {
  id: 'station-circles',
  type: 'circle',
  minzoom: 7,
  paint: {
    'circle-color': RAINFALL_COLOUR_SCALE,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2, 12, 5],
    'circle-opacity': ['case', ['==', ['get', 'rainfall_mm'], 0], 0.4, 0.9],
    'circle-stroke-width': 1,
    'circle-stroke-color': '#ffffff',
  },
}

export { RAINFALL_COLOUR_SCALE }

export function StationsSource() {
  const { data } = useStations()
  if (!data) return null
  return (
    <Source id="stations" type="geojson" data={data}>
      <Layer {...stationCircleLayer} />
    </Source>
  )
}
