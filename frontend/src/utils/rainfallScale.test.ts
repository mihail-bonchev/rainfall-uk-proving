import { describe, it, expect } from 'vitest'
import { bbcPosition, getRainfallScale, metOfficeBand, rainfallRgba, METOFFICE_BANDS } from './rainfallScale'

describe('getRainfallScale', () => {
  it('scales thresholds up with the length of the period', () => {
    expect(getRainfallScale('24h').max).toBeLessThan(getRainfallScale('7d').max)
    expect(getRainfallScale('7d').max).toBeLessThan(getRainfallScale('28d').max)
  })

  it('picks a custom-range scale from the number of days selected', () => {
    const range = (days: number) => ({ from: new Date('2026-09-01'), to: new Date(Date.UTC(2026, 8, days)) })
    expect(getRainfallScale('custom', range(1)).key).toBe('24h')
    expect(getRainfallScale('custom', range(5)).key).toBe('7d')
    expect(getRainfallScale('custom', range(20)).key).toBe('28d')
  })
})

describe('metOfficeBand', () => {
  const bounds = getRainfallScale('6h').bounds // 0.5, 1, 2, 4, 8, 16, 32

  it('maps values to the 8 Met Office bands', () => {
    expect(metOfficeBand(0.3, bounds)).toBe(0)
    expect(metOfficeBand(0.5, bounds)).toBe(1)
    expect(metOfficeBand(5, bounds)).toBe(4)
    expect(metOfficeBand(100, bounds)).toBe(METOFFICE_BANDS.length - 1)
  })
})

describe('rainfallRgba', () => {
  const scale = getRainfallScale('6h') // floor 0.1, bounds 0.5 1 2 4 8 16 32

  it('leaves dry areas uncoloured in both styles', () => {
    expect(rainfallRgba(0, scale, 'metoffice')).toBeNull()
    expect(rainfallRgba(0, scale, 'bbc')).toBeNull()
  })

  it('clamps BBC colours at the top of the scale', () => {
    expect(rainfallRgba(500, scale, 'bbc')).toEqual(rainfallRgba(32, scale, 'bbc'))
  })

  it('gets brighter as rain increases in the BBC style', () => {
    const brightness = (mm: number) => rainfallRgba(mm, scale, 'bbc')!.slice(0, 3).reduce((a, b) => a + b, 0)
    expect(brightness(0.3)).toBeLessThan(brightness(2))
    expect(brightness(2)).toBeLessThan(brightness(8))
  })

  it('fades the BBC colour in across the first band so dry edges are soft', () => {
    expect(rainfallRgba(0.1, scale, 'bbc')![3]).toBeLessThan(rainfallRgba(0.5, scale, 'bbc')![3])
    expect(rainfallRgba(2, scale, 'bbc')![3]).toBe(1)
  })
})

describe('bbcPosition', () => {
  const scale = getRainfallScale('6h')

  it('spaces the Met Office band edges evenly so small totals keep contrast', () => {
    expect(bbcPosition(0.1, scale)).toBe(0)
    expect(bbcPosition(1, scale)).toBeCloseTo(2 / 7)
    expect(bbcPosition(4, scale)).toBeCloseTo(4 / 7)
    expect(bbcPosition(32, scale)).toBe(1)
  })

  it('is -1 when dry', () => {
    expect(bbcPosition(0.05, scale)).toBe(-1)
  })
})
