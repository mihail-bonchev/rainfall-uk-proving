import { useEffect } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import { restyleBasemap } from '../utils/basemap'
import type { MapTheme } from '../utils/rainfallScale'

export function BasemapStyler({ theme }: { theme: MapTheme }) {
  const { current: mapRef } = useMap()
  useEffect(() => {
    if (!mapRef) return
    const map = mapRef.getMap()
    const apply = () => restyleBasemap(map, theme)
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [mapRef, theme])
  return null
}
