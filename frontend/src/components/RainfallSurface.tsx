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
  // The image is tagged with the inputs it was drawn from, so a stale image
  // (or one whose object URL was already revoked) is never shown.
  const [image, setImage] = useState<{ url: string; drawnFrom: object } | null>(null)
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

  const drawInputs = useMemo(() => ({ field, scale, theme, areas }), [field, scale, theme, areas])

  useEffect(() => {
    if (!drawInputs.field) return
    let cancelled = false
    let objectUrl: string | undefined
    renderField(drawInputs.field, drawInputs.scale, drawInputs.theme, drawInputs.areas).toBlob((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setImage({ url: objectUrl, drawnFrom: drawInputs })
    })
    return () => {
      cancelled = true
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 2000)
    }
  }, [drawInputs])

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

  if (!image || image.drawnFrom !== drawInputs || !labelLayerId) return null

  return (
    <>
      {/* Keyed by URL: each new image gets a fresh source instead of an in-place update. */}
      <Source key={image.url} id="rain-surface" type="image" url={image.url} coordinates={SURFACE_COORDINATES}>
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
