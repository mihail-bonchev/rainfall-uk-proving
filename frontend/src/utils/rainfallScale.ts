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
  // Tuned on real 90-day totals (Jul–Oct 2026: median 109 mm, IQR 85–160): no band holds > ~31% of gauges.
  '3m':  { key: '3m',  floor: 2,    bounds: [25, 50, 75, 100, 150, 250, 400], max: 400, label: '3-month total' },
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

// BBC-inspired ramp for the dark map: brightness rises with rain so the eye
// goes to the wet areas — deep blue → bright blue → cyan, with green/yellow
// reserved for the extremes. One colour per Met Office band edge
// (floor, bounds[0..6]), interpolated in log space between edges, so small
// totals get as much contrast as the Met Office bands instead of all landing
// in the bottom sliver of a linear 0..max ramp.
export const BBC_RAMP = [
  '#1d3f8f', '#2156c9', '#2f7be6', '#3ea0f0',
  '#5cc6f4', '#4fd8c4', '#86e07a', '#e6f05a',
]

type RGB = [number, number, number]
export type RGBA = [number, number, number, number]

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const METOFFICE_RGB = METOFFICE_BANDS.map(hexToRgb)
const BBC_RGB = BBC_RAMP.map(hexToRgb)

export function metOfficeBand(mm: number, bounds: number[]): number {
  let i = 0
  while (i < bounds.length && mm >= bounds[i]) i++
  return i
}

/** Band edges shared by both styles: [floor, ...bounds]. */
function edges(scale: RainfallScale): number[] {
  return [scale.floor, ...scale.bounds]
}

/** 0..1 position on the BBC ramp (log-interpolated between band edges); -1 when dry. */
export function bbcPosition(mm: number, scale: RainfallScale): number {
  const e = edges(scale)
  if (!(mm >= e[0] * 0.999)) return -1
  if (mm >= e[e.length - 1]) return 1
  let i = 0
  while (mm >= e[i + 1]) i++
  const f = Math.log(Math.max(mm, e[i]) / e[i]) / Math.log(e[i + 1] / e[i])
  return (i + f) / (e.length - 1)
}

/**
 * Colour + alpha (0..1) for a rainfall value, or null when dry — dry areas are
 * left uncoloured in both styles so they read as plain map. The BBC style
 * fades in across its first band so dry edges are soft, not hard holes.
 */
export function rainfallRgba(mm: number, scale: RainfallScale, theme: MapTheme): RGBA | null {
  if (theme === 'metoffice') {
    if (!(mm >= scale.floor * 0.999)) return null
    return [...METOFFICE_RGB[metOfficeBand(mm, scale.bounds)], 1]
  }
  const t = bbcPosition(mm, scale)
  if (t < 0) return null
  const x = t * (BBC_RGB.length - 1)
  const i = Math.min(Math.floor(x), BBC_RGB.length - 2)
  const f = x - i
  const [c0, c1] = [BBC_RGB[i], BBC_RGB[i + 1]]
  const firstBand = 1 / (BBC_RGB.length - 1)
  const alpha = t >= firstBand ? 1 : 0.45 + 0.55 * (t / firstBand)
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * f),
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
    Math.round(c0[2] + (c1[2] - c0[2]) * f),
    alpha,
  ]
}

export const NO_DATA_COLOUR: Record<MapTheme, string> = { bbc: '#6b7280', metoffice: '#9ca3af' }

/** True when a station feature has a numeric `rainfall_mm` (false = no reading). */
export const HAS_READING: ExpressionSpecification = ['==', ['typeof', ['get', 'rainfall_mm']], 'number']

/** MapLibre colour expression for station dots, matching the surface colours. */
export function stationColourExpression(scale: RainfallScale, theme: MapTheme): ExpressionSpecification {
  const value: ExpressionSpecification = ['get', 'rainfall_mm']
  let withReading: ExpressionSpecification
  if (theme === 'metoffice') {
    const steps = scale.bounds.flatMap((b, i) => [b, METOFFICE_BANDS[i + 1]])
    withReading = ['step', value, METOFFICE_BANDS[0], ...steps] as ExpressionSpecification
  } else {
    const stops = edges(scale).flatMap((edge, i) => [edge, BBC_RAMP[i]])
    withReading = ['case', ['<', value, scale.floor], '#46536f', ['interpolate', ['linear'], value, ...stops]] as ExpressionSpecification
  }
  return ['case', HAS_READING, withReading, NO_DATA_COLOUR[theme]]
}

export function formatMm(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(2)))
}
