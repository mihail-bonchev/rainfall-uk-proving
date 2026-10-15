import { useEffect, useState } from 'react'
import { useMap } from 'react-map-gl/maplibre'

/** Id of the basemap's first symbol layer, so our layers can sit beneath place names. */
export function useFirstLabelLayerId(): string | undefined {
  const { current: mapRef } = useMap()
  const [id, setId] = useState<string>()
  useEffect(() => {
    if (!mapRef) return
    const map = mapRef.getMap()
    const find = () => setId(map.getStyle().layers.find((l) => l.type === 'symbol')?.id)
    if (map.isStyleLoaded()) find()
    else map.once('load', find)
  }, [mapRef])
  return id
}
