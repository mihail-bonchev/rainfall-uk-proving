import { useEffect, useMemo, useState } from 'react'
import { Source, Layer, Popup, useMap, type LayerProps } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent } from 'maplibre-gl'
import type { Point } from 'geojson'
import { useStations, toGeoJSON } from '../hooks/useStations'
import { getRainfallScale, HAS_READING, stationColourExpression, type MapTheme, type RainfallScale } from '../utils/rainfallScale'

// Small clickable dots on top of the rainfall surface, coloured on the same scale.
function makeStationCircleLayer(scale: RainfallScale, theme: MapTheme): LayerProps {
  return {
    id: 'station-circles',
    type: 'circle',
    minzoom: 7,
    paint: {
      'circle-color': stationColourExpression(scale, theme),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2, 9, 4, 11, 6],
      // Gauges with no reading are drawn faded so they don't read as dry.
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, ['case', HAS_READING, 1, 0.45]],
      'circle-stroke-width': 1,
      'circle-stroke-color': theme === 'bbc' ? '#0b1220' : '#ffffff',
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.9],
    },
  }
}

interface TooltipState {
  label: string
  longitude: number
  latitude: number
}

interface Props {
  onStationClick?: (stationId: string) => void
  readingsMap?: Map<string, number>
  scale?: RainfallScale
  theme?: MapTheme
}

export function StationsSource({
  onStationClick,
  readingsMap = new Map(),
  scale = getRainfallScale('15m'),
  theme = 'bbc',
}: Props) {
  const { data: stations, isPending } = useStations()
  const { current: mapRef } = useMap()
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const geoJSON = useMemo(() => toGeoJSON(stations ?? [], readingsMap), [stations, readingsMap])

  useEffect(() => {
    if (!mapRef) return
    const map = mapRef.getMap()

    const handleStationClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      onStationClick?.(feature.properties?.id as string)
    }

    const handleStationEnter = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer'
      const feature = e.features?.[0]
      if (!feature) return
      const [longitude, latitude] = (feature.geometry as Point).coordinates
      setTooltip({ label: feature.properties?.label as string, longitude, latitude })
    }

    const handleStationLeave = () => {
      map.getCanvas().style.cursor = ''
      setTooltip(null)
    }

    map.on('click', 'station-circles', handleStationClick)
    map.on('mouseenter', 'station-circles', handleStationEnter)
    map.on('mouseleave', 'station-circles', handleStationLeave)

    return () => {
      map.off('click', 'station-circles', handleStationClick)
      map.off('mouseenter', 'station-circles', handleStationEnter)
      map.off('mouseleave', 'station-circles', handleStationLeave)
    }
  }, [mapRef, onStationClick])

  if (isPending) return null

  return (
    <>
      <Source id="stations" type="geojson" data={geoJSON}>
        <Layer {...makeStationCircleLayer(scale, theme)} />
      </Source>
      {tooltip && (
        <Popup
          longitude={tooltip.longitude}
          latitude={tooltip.latitude}
          closeButton={false}
          closeOnClick={false}
          offset={10}
        >
          <span className="text-sm font-medium px-1">{tooltip.label}</span>
        </Popup>
      )}
    </>
  )
}
