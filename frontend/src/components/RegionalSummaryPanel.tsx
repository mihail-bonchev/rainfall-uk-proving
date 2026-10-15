import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet'
import { Button } from './ui/button'
import { useIsMobile } from '../hooks/useIsMobile'
import { useStations } from '../hooks/useStations'
import { useRegionalSummary } from '../hooks/useRegionalSummary'
import { NATION_ORDER, type AreaSummary } from '../services/aggregation/regionalAggregator'
import type { TimeRange } from '../types/api'

type SortKey = keyof Pick<AreaSummary, 'areaName' | 'avgMm' | 'stationsWithData'>
type SortDir = 'asc' | 'desc'

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '15m': 'Last 15 minutes',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': '7-day',
  '28d': '28-day',
  '3m': '3-month',
  'custom': 'Custom period',
}

function computeQuartiles(areas: AreaSummary[]): { q1: number; q3: number } {
  if (areas.length < 4) return { q1: -Infinity, q3: Infinity }
  const sorted = [...areas].sort((a, b) => a.avgMm - b.avgMm)
  const q1 = sorted[Math.floor(sorted.length * 0.25)].avgMm
  const q3 = sorted[Math.floor(sorted.length * 0.75)].avgMm
  return { q1, q3 }
}

function sortAreas(areas: AreaSummary[], key: SortKey, dir: SortDir): AreaSummary[] {
  return [...areas].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })
}

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
}

function SortHeader({ label, sortKey, currentKey, dir, onSort }: SortHeaderProps) {
  const active = sortKey === currentKey
  return (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  timeRange: TimeRange
  readingsMap: Map<string, number>
  onDownloadCsv?: (areas: AreaSummary[]) => void
}

export function RegionalSummaryPanel({ open, onClose, timeRange, readingsMap, onDownloadCsv }: Props) {
  const isMobile = useIsMobile()
  const [sortKey, setSortKey] = useState<SortKey>('avgMm')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data: stations = [] } = useStations()
  const areas = useRegionalSummary(readingsMap, stations)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const { q1, q3 } = computeQuartiles(areas)
  // One section per nation (England's EA areas, then Scotland, …), sorted within each section.
  const nations = NATION_ORDER.filter((n) => areas.some((a) => a.nation === n))
  const sections = nations.map((nation) => ({
    nation,
    rows: sortAreas(areas.filter((a) => a.nation === nation), sortKey, sortDir),
  }))
  const subtitle = nations
    .map((n) => (n === 'England' ? `England (${areas.filter((a) => a.nation === n).length} EA areas)` : n))
    .join(' · ')

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        data-testid="regional-summary-panel"
        side={isMobile ? 'bottom' : 'left'}
        className={isMobile ? 'h-[85vh] overflow-y-auto' : 'sm:w-[480px] sm:max-w-none overflow-y-auto'}
      >
        <SheetHeader>
          <SheetTitle data-testid="regional-panel-title">
            Regional Summary
          </SheetTitle>
          <SheetDescription data-testid="regional-panel-subtitle">
            {TIME_RANGE_LABELS[timeRange]}{subtitle ? ` · ${subtitle}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <table data-testid="regional-table" className="w-full text-sm border-collapse min-w-[360px]">
              <thead>
                <tr className="border-b">
                  <SortHeader label="Area" sortKey="areaName" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Avg rainfall (mm)" sortKey="avgMm" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Stations w/ data" sortKey="stationsWithData" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {areas.length === 0 ? (
                  <tr>
                    <td data-testid="regional-no-data" colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                      No data for this period
                    </td>
                  </tr>
                ) : (
                  sections.flatMap(({ nation, rows }) => [
                    nations.length > 1 && (
                      <tr key={`nation-${nation}`} data-testid="regional-nation-row">
                        <td colSpan={3} className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {nation}
                        </td>
                      </tr>
                    ),
                    ...rows.map((area) => {
                    const isHigh = area.avgMm > q3
                    const isLow = area.avgMm < q1 && area.stationsWithData > 0
                    return (
                      <tr
                        key={area.areaName}
                        data-testid="regional-row"
                        className={[
                          'border-b transition-colors',
                          isHigh ? 'bg-blue-50 dark:bg-blue-950/20' : '',
                          isLow ? 'bg-slate-50 dark:bg-slate-900/20' : '',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2 font-medium">{area.areaName}</td>
                        <td className="px-3 py-2 tabular-nums">{area.avgMm.toFixed(1)}</td>
                        <td className="px-3 py-2 tabular-nums">{area.stationsWithData} / {area.stationCount}</td>
                      </tr>
                    )
                  }),
                  ])
                )}
              </tbody>
            </table>
          </div>

          {onDownloadCsv && areas.length > 0 && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                data-testid="download-csv-btn"
                onClick={() => onDownloadCsv(areas)}
              >
                Download CSV
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
