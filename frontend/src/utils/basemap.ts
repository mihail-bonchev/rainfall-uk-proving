import type { Map as MaplibreMap } from 'maplibre-gl'
import type { MapTheme } from './rainfallScale'

export const BASEMAP_STYLE: Record<MapTheme, string> = {
  bbc: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  metoffice: 'https://tiles.openfreemap.org/styles/positron',
}

const PALETTE: Record<MapTheme, { land: string; water: string }> = {
  bbc: { land: '#253151', water: '#121a2e' },
  metoffice: { land: '#d3e5c6', water: '#9cc6da' },
}

// Flattens the vendor basemap to two tones (land / sea) so the rainfall
// surface is the only thing carrying colour.
export function restyleBasemap(map: MaplibreMap, theme: MapTheme) {
  const { land, water } = PALETTE[theme]
  for (const layer of map.getStyle().layers) {
    const id = layer.id.toLowerCase()
    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', land)
    } else if (layer.type === 'fill' && id.includes('water')) {
      map.setPaintProperty(layer.id, 'fill-color', water)
      map.setPaintProperty(layer.id, 'fill-opacity', 1)
    } else if (layer.type === 'fill' && /landcover|landuse|park|wood|grass|building|aeroway/.test(id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
    } else if (layer.type === 'line' && id.includes('boundary')) {
      map.setPaintProperty(layer.id, 'line-color', theme === 'bbc' ? '#55607d' : '#7d8f7a')
    }
  }
}
