import type { DateRange } from 'react-day-picker'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { TimeRange } from '../types/api'

export type MapTheme = 'bbc' | 'metoffice'

export interface RainfallScale {
  key: Exclude<TimeRange, 'custom'>
  /** Below this the surface is transparent (effectively dry). */
  floor: number
  /** Met Office band boundaries — 7 values giving 8 bands. */
  bounds: number[]
  /** Top of the continuous BBC ramp ("100+" equivalent). */
  max: number
  label: string
}

const SCALES: Record<RainfallScale['key'], RainfallScale> = {
  '15m': { key: '15m', floor: 0.05, bounds: [0.2, 0.5, 1, 2, 3, 5, 8], max: 5, label: 'last 15 min' },
  '6h':  { key: '6h',  floor: 0.1,  bounds: [0.5, 1, 2, 4, 8, 16, 32], max: 30, label: '6-hour total' },
  '24h': { key: '24h', floor: 0.2,  bounds: [1, 2, 4, 8, 16, 32, 64], max: 50, label: '24-hour total' },
  '7d':  { key: '7d',  floor: 0.5,  bounds: [2, 5, 10, 20, 40, 80, 160], max: 80, label: '7-day total' },
  '28d': { key: '28d', floor: 1,    bounds: [5, 10, 25, 50, 100, 200, 300], max: 200, label: '28-day total' },
}

export function getRainfallScale(timeRange: TimeRange, customRange?: DateRange): RainfallScale {
  if (timeRange !== 'custom') return SCALES[timeRange]
  const from = customRange?.from?.getTime()
  const to = customRange?.to?.getTime()
  const days = from && to ? (to - from) / 86_400_000 + 1 : 1
  const key = days <= 1.5 ? '24h' : days <= 10 ? '7d' : '28d'
  return { ...SCALES[key], label: 'custom period total' }
}

// Sampled from the Met Office rainfall radar legend (<0.5 … >32 mm/h).
export const METOFFICE_BANDS = [
  '#1b2fd8', '#2f6cf5', '#17b4f0', '#1ea13a',
  '#f5c02c', '#f58c1f', '#e8231c', '#a10e17',
]

// Sampled from the BBC "Rainfall accumulation" graphic: pale blue (a little)
// through deep blue, with cyan/green/yellow reserved for the extremes.
export const BBC_STOPS: [number, string][] = [
  [0.0, '#b9def5'],
  [0.12, '#86c3ee'],
  [0.28, '#4f9fe2'],
  [0.45, '#2c78cf'],
  [0.62, '#1f58b4'],
  [0.76, '#2a9bd6'],
  [0.86, '#42c9b7'],
  [0.94, '#86e07a'],
  [1.0, '#e6f05a'],
]

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const METOFFICE_RGB = METOFFICE_BANDS.map(hexToRgb)
const BBC_RGB = BBC_STOPS.map(([t, c]) => [t, hexToRgb(c)] as const)

export function metOfficeBand(mm: number, bounds: number[]): number {
  let i = 0
  while (i < bounds.length && mm >= bounds[i]) i++
  return i
}

/** Colour for a rainfall value, or null when below the scale floor. */
export function rainfallRgb(mm: number, scale: RainfallScale, theme: MapTheme): RGB | null {
  if (!(mm >= scale.floor * 0.999)) return null
  if (theme === 'metoffice') return METOFFICE_RGB[metOfficeBand(mm, scale.bounds)]
  const t = Math.min(mm / scale.max, 1)
  for (let i = 1; i < BBC_RGB.length; i++) {
    const [t1, c1] = BBC_RGB[i]
    if (t <= t1) {
      const [t0, c0] = BBC_RGB[i - 1]
      const f = (t - t0) / (t1 - t0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ]
    }
  }
  return BBC_RGB[BBC_RGB.length - 1][1] as RGB
}

/** MapLibre colour expression for station dots, matching the surface colours. */
export function stationColourExpression(scale: RainfallScale, theme: MapTheme): ExpressionSpecification {
  const value: ExpressionSpecification = ['get', 'rainfall_mm']
  if (theme === 'metoffice') {
    const steps = scale.bounds.flatMap((b, i) => [b, METOFFICE_BANDS[i + 1]])
    return ['step', value, METOFFICE_BANDS[0], ...steps] as ExpressionSpecification
  }
  const stops = BBC_STOPS.flatMap(([t, c]) => [t * scale.max, c])
  return ['interpolate', ['linear'], value, ...stops] as ExpressionSpecification
}

export function formatMm(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(2)))
}
