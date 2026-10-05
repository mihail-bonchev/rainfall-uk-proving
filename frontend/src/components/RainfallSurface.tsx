import { useEffect, useMemo, useState } from 'react'
import { Source, Layer, useMap } from 'react-map-gl/maplibre'
import type { MapMouseEvent } from 'maplibre-gl'
import { useStations } from '../hooks/useStations'
import { useEAAreas } from '../hooks/useEAAreas'
import { computeField, removeOutliers, renderField, sampleField, SURFACE_COORDINATES } from '../utils/rainfallSurface'
import { formatMm, type MapTheme, type RainfallScale } from '../utils/rainfallScale'

interface Props {
  readingsMap: Map<string, number>
  scale: RainfallScale
  theme: MapTheme
}

interface Hover {
  x: number
  y: number
  mm: number
}

function useFirstLabelLayerId(): string | undefined {
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

export function RainfallSurface({ readingsMap, scale, theme }: Props) {
  const { data: stations } = useStations()
  const { data: areas } = useEAAreas()
  const { current: mapRef } = useMap()
  const labelLayerId = useFirstLabelLayerId()
  const [url, setUrl] = useState<string>()
  const [hover, setHover] = useState<Hover | null>(null)

  // Stations without a reading are left out rather than treated as dry.
  const field = useMemo(() => {
    if (!stations) return null
    const points = []
    for (const s of stations) {
      const mm = readingsMap.get(s.id)
      if (mm !== undefined && Number.isFinite(mm)) points.push({ lon: s.long, lat: s.lat, mm })
    }
    return points.length ? computeField(removeOutliers(points, scale.max, scale.floor)) : null
  }, [stations, readingsMap, scale.max, scale.floor])

  useEffect(() => {
    if (!field) return
    let cancelled = false
    let objectUrl: string | undefined
    renderField(field, scale, theme, areas).toBlob((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 2000)
    }
  }, [field, scale, theme, areas])

  useEffect(() => {
    if (!mapRef || !field) return
    const map = mapRef.getMap()
    const onMove = (e: MapMouseEvent) => {
      const mm = sampleField(field, e.lngLat.lng, e.lngLat.lat)
      setHover(mm === null || mm < scale.floor * 0.5 ? null : { x: e.point.x, y: e.point.y, mm })
    }
    const onOut = () => setHover(null)
    map.on('mousemove', onMove)
    map.on('mouseout', onOut)
    return () => {
      map.off('mousemove', onMove)
      map.off('mouseout', onOut)
    }
  }, [mapRef, field, scale])

  if (!url || !labelLayerId) return null

  return (
    <>
      <Source id="rain-surface" type="image" url={url} coordinates={SURFACE_COORDINATES}>
        <Layer
          id="rain-surface"
          type="raster"
          beforeId={labelLayerId}
          paint={{
            'raster-opacity': theme === 'bbc' ? 0.92 : 0.78,
            'raster-resampling': 'linear',
            'raster-fade-duration': 0,
          }}
        />
      </Source>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-sm"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          ≈ {formatMm(Math.round(hover.mm * 10) / 10)} mm
        </div>
      )}
    </>
  )
}
