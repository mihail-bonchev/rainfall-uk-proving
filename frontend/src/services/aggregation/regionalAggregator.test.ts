import { describe, it, expect } from 'vitest'
import { aggregateByArea } from './regionalAggregator'
import type { Station } from '../api/stationService'

function makeStation(id: string, eaAreaName: string): Station {
  return { id, label: id, lat: 51, long: -1, eaAreaName, gridReference: 'TQ000000' }
}

const stations: Station[] = [
  makeStation('E0001', 'Thames'),
  makeStation('E0002', 'Thames'),
  makeStation('E0003', 'Yorkshire'),
  makeStation('E0004', 'Yorkshire'),
]

describe('aggregateByArea', () => {
  it('returns an AreaSummary for each area represented in stations', () => {
    const result = aggregateByArea(new Map(), stations)
    expect(result.map((a) => a.areaName).sort()).toEqual(['Thames', 'Yorkshire'])
  })

  it('counts stationsWithData correctly', () => {
    const map = new Map([['E0001', 10], ['E0002', 20]])
    const result = aggregateByArea(map, stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.stationsWithData).toBe(2)
    expect(thames.stationCount).toBe(2)
  })

  it('avgMm is the mean of stations with data, not total station count', () => {
    const map = new Map([['E0001', 12]])
    const result = aggregateByArea(map, stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.avgMm).toBe(12)
    expect(thames.stationsWithData).toBe(1)
    expect(thames.stationCount).toBe(2)
  })

  it('maxMm is the highest (capped) individual station total', () => {
    const map = new Map([['E0001', 5], ['E0002', 15]])
    const result = aggregateByArea(map, stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.maxMm).toBe(15)
  })

  it('caps station values at 500 mm before averaging', () => {
    // 45 + 60 + 500 (capped from 800) = 605; avg = 201.67
    const area3 = [makeStation('A', 'Test'), makeStation('B', 'Test'), makeStation('C', 'Test')]
    const map = new Map([['A', 45], ['B', 60], ['C', 800]])
    const result = aggregateByArea(map, area3)
    const test = result.find((a) => a.areaName === 'Test')!
    expect(test.avgMm).toBeCloseTo((45 + 60 + 500) / 3)
    expect(test.maxMm).toBe(500)
  })

  it('handles stations with no data — stationsWithData is 0, avgMm is 0', () => {
    const result = aggregateByArea(new Map(), stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.stationsWithData).toBe(0)
    expect(thames.avgMm).toBe(0)
    expect(thames.maxMm).toBe(0)
  })

  it('ignores readingsMap entries for unknown stationRefs', () => {
    const map = new Map([['UNKNOWN', 999]])
    const result = aggregateByArea(map, stations)
    result.forEach((a) => {
      expect(a.stationsWithData).toBe(0)
    })
  })

  it('groups by eaAreaName correctly across all 14 EA areas', () => {
    const areaNames = [
      'Thames', 'Herts and North London', 'Cumbria and Lancashire',
      'East Midlands', 'Devon and Cornwall', 'Wessex',
      'Kent S London and E Sussex', 'Solent and South Downs',
      'Lincs and Northants', 'Yorkshire', 'Gtr Mancs Mersey and Ches',
      'North East', 'East Anglia', 'West Midlands',
    ]
    const manyStations = areaNames.map((area, i) => makeStation(`E${i}`, area))
    const result = aggregateByArea(new Map(), manyStations)
    expect(result).toHaveLength(14)
    expect(result.map((a) => a.areaName).sort()).toEqual([...areaNames].sort())
  })
})
