import { describe, it, expect } from 'vitest'
import { computeField, removeOutliers, sampleField } from './rainfallSurface'

describe('computeField', () => {
  const points = [
    { lon: -1.5, lat: 52.0, mm: 10 },
    { lon: -1.3, lat: 52.0, mm: 30 },
  ]
  const field = computeField(points, 200)

  it('reproduces a station value near that station', () => {
    expect(sampleField(field, -1.52, 52.0)).toBeCloseTo(10, -0.5)
  })

  it('blends smoothly between neighbouring stations', () => {
    const mid = sampleField(field, -1.4, 52.0)!
    expect(mid).toBeGreaterThan(15)
    expect(mid).toBeLessThan(25)
  })

  it('returns null far from any station', () => {
    expect(sampleField(field, 1.5, 55.5)).toBeNull()
  })
})

describe('removeOutliers', () => {
  const ring = (mm: number) =>
    [0, 1, 2, 3, 4].map((k) => ({ lon: -1.5 + 0.05 * Math.cos(k), lat: 52 + 0.05 * Math.sin(k), mm }))

  it('drops a stuck-high gauge surrounded by ordinary readings', () => {
    const out = removeOutliers([...ring(50), { lon: -1.5, lat: 52, mm: 400 }], 200, 1)
    expect(out).toHaveLength(5)
  })

  it('drops a zero gauge in an otherwise wet area', () => {
    const out = removeOutliers([...ring(60), { lon: -1.5, lat: 52, mm: 0 }], 200, 1)
    expect(out).toHaveLength(5)
  })

  it('keeps a moderately wetter station', () => {
    const out = removeOutliers([...ring(50), { lon: -1.5, lat: 52, mm: 90 }], 200, 1)
    expect(out).toHaveLength(6)
  })

  it('judges an isolated gauge against a wider 50 km ring', () => {
    // Four gauges ~40 km away (outside 25 km, inside 50 km) and one stuck-high gauge in the middle.
    const far = [0, 1, 2, 3].map((k) => ({ lon: -4 + 0.65 * Math.cos(k * Math.PI / 2), lat: 57 + 0.36 * Math.sin(k * Math.PI / 2), mm: 30 }))
    const out = removeOutliers([...far, { lon: -4, lat: 57, mm: 900 }], 200, 1)
    expect(out).toHaveLength(4)
  })

  it('keeps an isolated gauge that is merely much wetter than distant neighbours', () => {
    const far = [0, 1, 2, 3].map((k) => ({ lon: -4 + 0.65 * Math.cos(k * Math.PI / 2), lat: 57 + 0.36 * Math.sin(k * Math.PI / 2), mm: 60 }))
    const out = removeOutliers([...far, { lon: -4, lat: 57, mm: 200 }], 200, 1)
    expect(out).toHaveLength(5)
  })
})
