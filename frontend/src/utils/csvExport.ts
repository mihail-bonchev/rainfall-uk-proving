import type { DateRange } from 'react-day-picker'
import type { AreaSummary } from '../services/aggregation/regionalAggregator'
import type { TimeRange } from '../types/api'

function escapeField(value: string | number): string {
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function generateRegionalCsvContent(areas: AreaSummary[]): string {
  const header = ['Area', 'Avg Rainfall (mm)', 'Stations With Data']
  const rows = areas.map((a) => [
    escapeField(a.areaName),
    escapeField(a.avgMm.toFixed(1)),
    escapeField(a.stationsWithData),
  ])
  return [header, ...rows].map((r) => r.join(',')).join('\n')
}

export function buildCsvFilename(timeRange: TimeRange, customRange?: DateRange): string {
  const now = new Date()

  if (timeRange === 'custom' && customRange?.from && customRange?.to) {
    return `rainfall-summary-${toDateStr(customRange.from)}-to-${toDateStr(customRange.to)}.csv`
  }

  const TIME_RANGE_DAYS: Record<TimeRange, number> = {
    '15m': 0,
    '6h': 0,
    '24h': 1,
    '7d': 7,
    '28d': 28,
    'custom': 0,
  }
  const days = TIME_RANGE_DAYS[timeRange]
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return days > 0
    ? `rainfall-summary-${toDateStr(from)}-to-${toDateStr(now)}.csv`
    : `rainfall-summary-${toDateStr(now)}.csv`
}

export function downloadRegionalCsv(areas: AreaSummary[], timeRange: TimeRange, customRange?: DateRange): void {
  const csv = generateRegionalCsvContent(areas)
  const filename = buildCsvFilename(timeRange, customRange)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
