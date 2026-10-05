import { describe, it, expect } from 'vitest'
import { getRainfallScale, metOfficeBand, rainfallRgb, METOFFICE_BANDS } from './rainfallScale'

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

describe('rainfallRgb', () => {
  const scale = getRainfallScale('7d')

  it('is transparent (null) below the scale floor', () => {
    expect(rainfallRgb(0, scale, 'bbc')).toBeNull()
    expect(rainfallRgb(0, scale, 'metoffice')).toBeNull()
  })

  it('clamps BBC colours at the top of the scale', () => {
    expect(rainfallRgb(scale.max * 3, scale, 'bbc')).toEqual(rainfallRgb(scale.max, scale, 'bbc'))
  })

  it('gets lighter-to-deeper blue as rain increases in the BBC ramp', () => {
    const light = rainfallRgb(scale.max * 0.05, scale, 'bbc')!
    const deep = rainfallRgb(scale.max * 0.6, scale, 'bbc')!
    expect(deep[0] + deep[1] + deep[2]).toBeLessThan(light[0] + light[1] + light[2])
  })
})
