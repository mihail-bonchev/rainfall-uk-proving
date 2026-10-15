import type { FeatureCollection, Position } from 'geojson'
import { rainfallRgba, type MapTheme, type RainfallScale } from './rainfallScale'

export interface RainPoint {
  lon: number
  lat: number
  mm: number
}

// Great Britain (Scilly → Shetland, St Kilda → East Anglia) plus margin. Laid out in Web
// Mercator so it lines up exactly with MapLibre's image source corners.
export const SURFACE_BOUNDS = { west: -8.8, east: 2.0, south: 49.7, north: 61.0 }

const SIGMA_KM = 9
const CUTOFF_KM = SIGMA_KM * 2.8
// Softening radius: weights ~1/(r² + R0²) keep each station's own value
// near it, the Gaussian taper blends smoothly towards neighbours.
const R0_KM = 4
const KM_PER_DEG_LAT = 110.57
// Longitude degrees shrink with latitude (~67 km at 53°N, ~54 km at 61°N); use each point's own.
const kmPerDegLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180)

const mercX = (lon: number) => (lon + 180) / 360
const mercY = (lat: number) => {
  const phi = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2
}
const latFromMercY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI

const MX0 = mercX(SURFACE_BOUNDS.west)
const MX1 = mercX(SURFACE_BOUNDS.east)
const MY0 = mercY(SURFACE_BOUNDS.north)
const MY1 = mercY(SURFACE_BOUNDS.south)

export interface SurfaceField {
  width: number
  height: number
  /** Σ wᵢ·mmᵢ per cell */
  num: Float64Array
  /** Σ wᵢ per cell */
  den: Float64Array
  /** Σ Gaussian(rᵢ) — how well covered by nearby stations (≈1 beside a station) */
  cov: Float64Array
}

const QC_RADIUS_KM = 25

/**
 * "Buddy check": drops stations wildly out of line with their neighbours
 * (stuck or blocked gauges) so they don't paint bullseyes on the surface.
 * Thresholds are relative to the period's scale so short-period convective
 * downpours, which are legitimately local, survive.
 */
export function removeOutliers(points: RainPoint[], scaleMax: number, scaleFloor: number): RainPoint[] {
  const xy = points.map((p) => [p.lon * kmPerDegLon(p.lat), p.lat * KM_PER_DEG_LAT])
  const r2max = QC_RADIUS_KM * QC_RADIUS_KM
  const neighbours = (i: number, r2: number) => {
    const near: number[] = []
    for (let k = 0; k < points.length; k++) {
      if (k === i) continue
      const dx = xy[k][0] - xy[i][0]
      const dy = xy[k][1] - xy[i][1]
      if (dx * dx + dy * dy <= r2) near.push(points[k].mm)
    }
    return near.sort((a, b) => a - b)
  }
  return points.filter((p, i) => {
    let near = neighbours(i, r2max)
    // Isolated gauges (sparse Highlands, ~13% of SEPA's) are judged against a wider 50 km
    // ring with looser limits, since real totals vary more over that distance.
    const wide = near.length < 3
    if (wide) near = neighbours(i, 4 * r2max)
    if (near.length < 3) return true
    const median = near[Math.floor(near.length / 2)]
    const [hiRatio, hiAbs, loRatio, loFloor] = wide ? [5, 0.5, 0.1, 8] : [3, 0.3, 0.2, 4]
    const tooHigh = p.mm > median * hiRatio && p.mm - median > scaleMax * hiAbs
    const tooLow = p.mm < median * loRatio && median > scaleFloor * loFloor
    return !tooHigh && !tooLow
  })
}

/**
 * Gaussian kernel-weighted average of station totals on a Mercator grid.
 * Unlike a heatmap (which measures station *density*), every cell holds an
 * estimate of rainfall in mm, so neighbouring stations blend into one field.
 */
// ~0.029° of longitude per cell, as before the extension to Great Britain.
export function computeField(points: RainPoint[], width = 376): SurfaceField {
  const height = Math.round((width * (MY1 - MY0)) / (MX1 - MX0))
  const num = new Float64Array(width * height)
  const den = new Float64Array(width * height)
  const cov = new Float64Array(width * height)

  const bucket = new Map<string, { x: number; y: number; mm: number }[]>()
  const key = (bx: number, by: number) => `${bx},${by}`
  for (const p of points) {
    const x = p.lon * kmPerDegLon(p.lat)
    const y = p.lat * KM_PER_DEG_LAT
    const k = key(Math.floor(x / CUTOFF_KM), Math.floor(y / CUTOFF_KM))
    const list = bucket.get(k)
    if (list) list.push({ x, y, mm: p.mm })
    else bucket.set(k, [{ x, y, mm: p.mm }])
  }

  const inv2s2 = 1 / (2 * SIGMA_KM * SIGMA_KM)
  const cutoff2 = CUTOFF_KM * CUTOFF_KM

  for (let j = 0; j < height; j++) {
    const lat = latFromMercY(MY0 + ((j + 0.5) / height) * (MY1 - MY0))
    const cy = lat * KM_PER_DEG_LAT
    const by = Math.floor(cy / CUTOFF_KM)
    for (let i = 0; i < width; i++) {
      const lon = (MX0 + ((i + 0.5) / width) * (MX1 - MX0)) * 360 - 180
      const cx = lon * kmPerDegLon(lat)
      const bx = Math.floor(cx / CUTOFF_KM)
      let n = 0
      let d = 0
      let c = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = bucket.get(key(bx + dx, by + dy))
          if (!list) continue
          for (const s of list) {
            const ex = s.x - cx
            const ey = s.y - cy
            const r2 = ex * ex + ey * ey
            if (r2 > cutoff2) continue
            const g = Math.exp(-r2 * inv2s2)
            const w = g / (r2 + R0_KM * R0_KM)
            n += w * s.mm
            d += w
            c += g
          }
        }
      }
      num[j * width + i] = n
      den[j * width + i] = d
      cov[j * width + i] = c
    }
  }
  return { width, height, num, den, cov }
}

/** Estimated rainfall (mm) at a lon/lat, or null if no station is near. */
export function sampleField(field: SurfaceField, lon: number, lat: number): number | null {
  const fx = ((mercX(lon) - MX0) / (MX1 - MX0)) * field.width - 0.5
  const fy = ((mercY(lat) - MY0) / (MY1 - MY0)) * field.height - 0.5
  const i = Math.round(fx)
  const j = Math.round(fy)
  if (i < 0 || j < 0 || i >= field.width || j >= field.height) return null
  const k = j * field.width + i
  return field.cov[k] > 0.08 ? field.num[k] / field.den[k] : null
}

function bilinear(arr: Float64Array, w: number, h: number, fx: number, fy: number): number {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)))
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))
  const a = arr[y0 * w + x0] + (arr[y0 * w + x1] - arr[y0 * w + x0]) * tx
  const b = arr[y1 * w + x0] + (arr[y1 * w + x1] - arr[y1 * w + x0]) * tx
  return a + (b - a) * ty
}

function traceRing(ctx: CanvasRenderingContext2D, ring: Position[], cw: number, ch: number) {
  ring.forEach(([lon, lat], idx) => {
    const x = ((mercX(lon) - MX0) / (MX1 - MX0)) * cw
    const y = ((mercY(lat) - MY0) / (MY1 - MY0)) * ch
    if (idx === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
}

/**
 * Paints the field onto a canvas at `scale`× the field resolution. Numerator and
 * denominator are upsampled separately so band edges stay crisp and smooth,
 * coverage fades softly where stations run out, and the result is clipped to
 * the land polygons (EA stations only cover England).
 */
export function renderField(
  field: SurfaceField,
  scale: RainfallScale,
  theme: MapTheme,
  clip: FeatureCollection | undefined,
  upscale = 3,
): HTMLCanvasElement {
  const cw = field.width * upscale
  const ch = field.height * upscale
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(cw, ch)
  const px = img.data

  for (let y = 0; y < ch; y++) {
    const fy = (y + 0.5) / upscale - 0.5
    for (let x = 0; x < cw; x++) {
      const fx = (x + 0.5) / upscale - 0.5
      const c = bilinear(field.cov, field.width, field.height, fx, fy)
      if (c < 0.01) continue
      const mm =
        bilinear(field.num, field.width, field.height, fx, fy) /
        bilinear(field.den, field.width, field.height, fx, fy)
      const rgb = rainfallRgba(mm, scale, theme)
      if (!rgb) continue
      const o = (y * cw + x) * 4
      px[o] = rgb[0]
      px[o + 1] = rgb[1]
      px[o + 2] = rgb[2]
      px[o + 3] = Math.round(255 * rgb[3] * Math.min(1, (c - 0.01) / 0.04))
    }
  }
  ctx.putImageData(img, 0, 0)

  if (clip) {
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    for (const f of clip.features) {
      const g = f.geometry
      if (g.type === 'Polygon') g.coordinates.forEach((r) => traceRing(ctx, r, cw, ch))
      else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((r) => traceRing(ctx, r, cw, ch)))
    }
    ctx.fill('nonzero')
    ctx.globalCompositeOperation = 'source-over'
  }
  return canvas
}

export const SURFACE_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [SURFACE_BOUNDS.west, SURFACE_BOUNDS.north],
  [SURFACE_BOUNDS.east, SURFACE_BOUNDS.north],
  [SURFACE_BOUNDS.east, SURFACE_BOUNDS.south],
  [SURFACE_BOUNDS.west, SURFACE_BOUNDS.south],
]
