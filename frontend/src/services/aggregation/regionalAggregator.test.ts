import { describe, it, expect } from 'vitest'
import { aggregateByArea } from './regionalAggregator'
import type { Station } from '../api/stationService'
import type { StationTotal } from './regionalAggregator'

function makeStation(id: string, eaAreaName: string): Station {
  return { id, label: id, lat: 51, long: -1, eaAreaName, gridReference: 'TQ000000' }
}

describe('aggregateByArea', () => {
  const stations: Station[] = [
    makeStation('E0001', 'Thames'),
    makeStation('E0002', 'Thames'),
    makeStation('E0003', 'Yorkshire'),
    makeStation('E0004', 'Yorkshire'),
  ]

  it('returns an AreaSummary for each area represented in stations', () => {
    const result = aggregateByArea([], stations)
    expect(result.map((a) => a.areaName).sort()).toEqual(['Thames', 'Yorkshire'])
  })

  it('sums totalMm and counts stationsWithData correctly', () => {
    const totals: StationTotal[] = [
      { stationRef: 'E0001', totalMm: 10 },
      { stationRef: 'E0002', totalMm: 20 },
    ]
    const result = aggregateByArea(totals, stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.totalMm).toBe(30)
    expect(thames.stationsWithData).toBe(2)
    expect(thames.stationCount).toBe(2)
  })

  it('avgMm is totalMm divided by stationsWithData, not stationCount', () => {
    const totals: StationTotal[] = [
      { stationRef: 'E0001', totalMm: 12 },
    ]
    const result = aggregateByArea(totals, stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.avgMm).toBe(12)
    expect(thames.stationsWithData).toBe(1)
    expect(thames.stationCount).toBe(2)
  })

  it('maxMm is the highest individual station total', () => {
    const totals: StationTotal[] = [
      { stationRef: 'E0001', totalMm: 5 },
      { stationRef: 'E0002', totalMm: 15 },
    ]
    const result = aggregateByArea(totals, stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.maxMm).toBe(15)
  })

  it('handles stations with no data in range — stationsWithData is 0', () => {
    const result = aggregateByArea([], stations)
    const thames = result.find((a) => a.areaName === 'Thames')!
    expect(thames.stationsWithData).toBe(0)
    expect(thames.totalMm).toBe(0)
    expect(thames.avgMm).toBe(0)
    expect(thames.maxMm).toBe(0)
  })

  it('ignores stationTotals for unknown stationRefs', () => {
    const totals: StationTotal[] = [
      { stationRef: 'UNKNOWN', totalMm: 999 },
    ]
    const result = aggregateByArea(totals, stations)
    result.forEach((a) => {
      expect(a.stationsWithData).toBe(0)
      expect(a.totalMm).toBe(0)
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
    const result = aggregateByArea([], manyStations)
    expect(result).toHaveLength(14)
    expect(result.map((a) => a.areaName).sort()).toEqual([...areaNames].sort())
  })
})
