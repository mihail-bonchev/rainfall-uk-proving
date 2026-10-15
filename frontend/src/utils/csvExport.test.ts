import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateRegionalCsvContent, buildCsvFilename, downloadRegionalCsv } from './csvExport'
import type { AreaSummary } from '../services/aggregation/regionalAggregator'

const AREAS: AreaSummary[] = [
  { nation: 'England', areaName: 'Thames', avgMm: 5.3, maxMm: 10.0, stationCount: 10, stationsWithData: 8 },
  { nation: 'England', areaName: 'Yorkshire', avgMm: 15.0, maxMm: 30.0, stationCount: 12, stationsWithData: 8 },
  { nation: 'England', areaName: 'Devon, Cornwall', avgMm: 2.5, maxMm: 4.0, stationCount: 5, stationsWithData: 3 },
]

describe('generateRegionalCsvContent', () => {
  it('includes the correct header row', () => {
    const csv = generateRegionalCsvContent([])
    const header = csv.split('\n')[0]
    expect(header).toBe('Nation,Area,Avg Rainfall (mm),Stations With Data')
  })

  it('produces one row per area after the header', () => {
    const csv = generateRegionalCsvContent(AREAS)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(4) // 1 header + 3 rows
  })

  it('formats avgMm to 1 decimal place', () => {
    const csv = generateRegionalCsvContent([AREAS[0]])
    expect(csv).toContain('5.3')
  })

  it('includes stationsWithData count', () => {
    const csv = generateRegionalCsvContent([AREAS[0]])
    expect(csv).toContain('8')
  })

  it('escapes area names containing commas with double quotes', () => {
    const csv = generateRegionalCsvContent([AREAS[2]])
    const dataRow = csv.split('\n')[1]
    expect(dataRow).toMatch(/^England,"Devon, Cornwall"/)
  })

  it('returns only the header for empty areas array', () => {
    const csv = generateRegionalCsvContent([])
    expect(csv).toBe('Nation,Area,Avg Rainfall (mm),Stations With Data')
  })
})

describe('buildCsvFilename', () => {
  it('includes date range for 7d preset', () => {
    const filename = buildCsvFilename('7d')
    expect(filename).toMatch(/^rainfall-summary-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('includes date range for 28d preset', () => {
    const filename = buildCsvFilename('28d')
    expect(filename).toMatch(/^rainfall-summary-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('uses just today for 15m preset', () => {
    const filename = buildCsvFilename('15m')
    expect(filename).toMatch(/^rainfall-summary-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(filename.split('to').length).toBe(1)
  })

  it('uses custom from/to dates when timeRange is custom and customRange provided', () => {
    const filename = buildCsvFilename('custom', {
      from: new Date('2024-11-14'),
      to: new Date('2024-11-21'),
    })
    expect(filename).toBe('rainfall-summary-2024-11-14-to-2024-11-21.csv')
  })
})

describe('downloadRegionalCsv', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls URL.createObjectURL with a Blob', () => {
    downloadRegionalCsv(AREAS, '7d')
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('revokes the object URL after triggering download', () => {
    downloadRegionalCsv(AREAS, '7d')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('triggers download via anchor click', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadRegionalCsv(AREAS, '7d')
    expect(clickSpy).toHaveBeenCalled()
  })
})
